// Advisory checks for a public atom submission directory (Phase 3 slice 3.5). Runs in CI on
// pull requests and NEVER approves — a human owner still reviews and merges. Kept a plain node
// module because CI cannot import the app's TypeScript audit (`src/main/atoms/audit.ts`); this is
// the recorded minimal re-implementation (see docs/tandem/atom-distribution/decisions.md), and the
// full-audit reuse waits for the build-output-import solution planned with the CLI dedupe.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';

const ATOM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SUBMISSION_MAX_BYTES = 64 * 1024 * 1024;
const SUBMISSION_MAX_FILES = 4096;
const FORBIDDEN_NAMES = new Set(['manifest.sig', '.git', 'node_modules', '.env']);
const FORBIDDEN_SUFFIXES = ['.pem', '.key'];
const SECRET_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

const finding = (code, message) => ({ code, message });

const listFilesRecursive = async (root) => {
  const files = [];
  const walk = async (dir, rel) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        files.push({ relPath, dir: true });
        await walk(join(dir, entry.name), relPath);
      } else {
        files.push({ relPath, dir: false });
      }
    }
  };
  await walk(root, '');
  return files;
};

const entryIsConfined = (entry) => {
  if (!entry || entry.startsWith('/') || entry.includes('\\')) return false;
  const normalized = normalize(entry);
  return !normalized.startsWith('..') && !normalized.split(sep).includes('..');
};

/** Run every advisory check against a submission directory; findings never stop at the first hit. */
export const checkSubmission = async (submissionDir) => {
  const findings = [];

  let manifest = null;
  try {
    const parsed = JSON.parse(await readFile(join(submissionDir, 'manifest.json'), 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) manifest = parsed;
    else findings.push(finding('manifest-invalid', 'manifest.json is not a JSON object.'));
  } catch {
    findings.push(finding('manifest-invalid', 'manifest.json is missing or not valid JSON.'));
  }

  if (manifest) {
    if (typeof manifest.id !== 'string' || !ATOM_ID_PATTERN.test(manifest.id)) {
      findings.push(finding('id-invalid', 'manifest.id must be lowercase-kebab (a-z, 0-9, hyphens).'));
    }
    if (typeof manifest.version !== 'string' || !VERSION_PATTERN.test(manifest.version)) {
      findings.push(finding('version-invalid', 'manifest.version must be MAJOR.MINOR.PATCH.'));
    }
    if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
      findings.push(finding('name-missing', 'manifest.name is required.'));
    }
    if (typeof manifest.entry !== 'string' || !entryIsConfined(manifest.entry)) {
      findings.push(finding('entry-invalid', 'manifest.entry must be a relative path inside the submission.'));
    } else {
      const present = await stat(join(submissionDir, manifest.entry))
        .then((info) => info.isFile())
        .catch(() => false);
      if (!present) findings.push(finding('entry-missing', `Entry file "${manifest.entry}" is not in the submission.`));
    }
  }

  let files = [];
  try {
    files = await listFilesRecursive(submissionDir);
  } catch {
    findings.push(finding('unreadable', 'Submission directory could not be read.'));
    return { ok: false, findings };
  }

  if (files.length > SUBMISSION_MAX_FILES) {
    findings.push(finding('too-many-files', `Submission has ${files.length} entries (max ${SUBMISSION_MAX_FILES}).`));
  }

  let totalBytes = 0;
  for (const file of files) {
    const name = file.relPath.split('/').pop() ?? file.relPath;
    if (FORBIDDEN_NAMES.has(name) || FORBIDDEN_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
      findings.push(finding('forbidden-file', `"${file.relPath}" must not ship in a submission.`));
    }
    if (file.dir) continue;
    const info = await stat(join(submissionDir, file.relPath)).catch(() => null);
    if (!info) continue;
    totalBytes += info.size;
    if (info.size <= 1024 * 1024) {
      const text = await readFile(join(submissionDir, file.relPath), 'utf8').catch(() => '');
      if (SECRET_PATTERN.test(text)) {
        findings.push(finding('secret-material', `"${file.relPath}" contains private-key material.`));
      }
    }
  }
  if (totalBytes > SUBMISSION_MAX_BYTES) {
    findings.push(finding('too-large', `Submission is ${totalBytes} bytes (max ${SUBMISSION_MAX_BYTES}).`));
  }

  return { ok: findings.length === 0, findings };
};
