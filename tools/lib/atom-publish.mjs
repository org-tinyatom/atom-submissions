import { createHash, randomUUID, sign } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { create } from 'tar';
import { ATOM_CAPABILITIES } from '../atom-capabilities.mjs';

const PACKAGE_MAX_BYTES = 64 * 1024 * 1024;
const PACKAGE_MAX_FILES = 4096;
const EXCLUDED_DIR_NAMES = new Set(['.tinyatom', '.git', 'node_modules']);
const EXCLUDED_ROOT_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'manifest.sig']);
const ATOM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export const sha256Hex = (data) =>
  createHash('sha256').update(data).digest('hex');

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSafeEntryPath = (entry) => {
  if (entry === '' || entry.startsWith('/') || entry.startsWith('\\'))
    return false;
  if (/^[A-Za-z]:/.test(entry)) return false;
  if (entry.includes('\0')) return false;
  return entry
    .split(/[/\\]/)
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
};

const shouldExclude = (segments) => {
  if (segments.some((segment) => EXCLUDED_DIR_NAMES.has(segment))) return true;
  const [first] = segments;
  return segments.length === 1 && EXCLUDED_ROOT_FILES.has(first);
};

const archivePath = (segments) => segments.join('/');

const inventoryWorkspace = async (
  workspaceRoot,
  segments = [],
  state = { files: [], bytes: 0 },
) => {
  const entries = await readdir(join(workspaceRoot, ...segments), {
    withFileTypes: true,
  });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const nextSegments = [...segments, entry.name];
    if (shouldExclude(nextSegments)) continue;

    const abs = join(workspaceRoot, ...nextSegments);
    const stat = await lstat(abs);
    if (stat.isDirectory()) {
      const next = await inventoryWorkspace(workspaceRoot, nextSegments, state);
      if (!next) return null;
      continue;
    }
    if (!stat.isFile()) return null;

    state.files.push(archivePath(nextSegments));
    state.bytes += stat.size;
    if (
      state.files.length > PACKAGE_MAX_FILES ||
      state.bytes > PACKAGE_MAX_BYTES
    )
      return null;
  }
  return state;
};

const copyInventoriedFiles = async (workspaceRoot, stagingDir, files) => {
  for (const file of files) {
    const dest = join(stagingDir, ...file.split('/'));
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(workspaceRoot, ...file.split('/')), dest);
  }
};

// Vendored: the app reads ATOM_CAPABILITIES out of src/types/atom-ipc.ts; here it comes from the local
// atom-capabilities.mjs so this pipeline is self-contained. The unused arg keeps the call site unchanged.
export const readAtomCapabilities = async () => new Set(ATOM_CAPABILITIES);

const parseManifest = (raw) => {
  if (!isRecord(raw)) throw new Error('manifest.json must be an object');
  const { id, name, version, entry, capabilities } = raw;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof version !== 'string' ||
    typeof entry !== 'string' ||
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) => typeof capability === 'string')
  ) {
    throw new Error('manifest.json is missing required fields');
  }
  return { id, name: name.trim(), version, entry, capabilities };
};

const validateManifest = (manifest, knownCapabilities, files) => {
  const issues = [];
  if (!ATOM_ID_PATTERN.test(manifest.id))
    issues.push('id must be lowercase kebab-case');
  if (!manifest.name) issues.push('name must not be empty');
  if (!VERSION_PATTERN.test(manifest.version))
    issues.push('version must be semver');
  if (!isSafeEntryPath(manifest.entry))
    issues.push('entry must be a confined relative path');
  if (!files.includes(manifest.entry))
    issues.push(`entry file is missing from workspace: ${manifest.entry}`);
  for (const capability of manifest.capabilities) {
    if (!knownCapabilities.has(capability))
      issues.push(`unknown capability: ${capability}`);
  }
  if (issues.length > 0)
    throw new Error(`Manifest audit failed: ${issues.join('; ')}`);
};

const readCatalog = async (catalogPath) => {
  try {
    const parsed = JSON.parse(await readFile(catalogPath, 'utf8'));
    if (Array.isArray(parsed)) return { atoms: parsed };
    if (isRecord(parsed) && Array.isArray(parsed.atoms))
      return { ...parsed, atoms: parsed.atoms };
    throw new Error(
      'catalog must be an array or an object with an atoms array',
    );
  } catch (error) {
    if (error && error.code === 'ENOENT') return { atoms: [] };
    throw error;
  }
};

const writeTextAtomic = async (path, text) => {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(tempPath, text, 'utf8');
  await rename(tempPath, path);
};

// Sign the EXACT catalog.json bytes and write a detached, base64-encoded `catalog.json.sig` beside them.
// The app verifies this signature over the exact bytes it fetches (P3-A), so the signed text and the file
// on disk must be byte-identical — sign the serialized string, never a re-serialization of the object.
const writeSignedCatalog = async (catalogPath, catalogValue, privateKeyPem) => {
  const catalogJson = `${JSON.stringify(catalogValue, null, 2)}\n`;
  await writeTextAtomic(catalogPath, catalogJson);
  const signature = sign(null, Buffer.from(catalogJson, 'utf8'), privateKeyPem).toString('base64');
  await writeTextAtomic(`${catalogPath}.sig`, `${signature}\n`);
};

const packageUrlFor = ({
  packageUrl,
  baseUrl,
  packagePath,
  packageFileName,
}) => {
  if (packageUrl) return new URL(packageUrl).href;
  if (baseUrl)
    return new URL(packageFileName, `${baseUrl.replace(/\/+$/, '')}/`).href;
  return pathToFileURL(packagePath).href;
};

const catalogEntryFor = ({
  manifest,
  packageUrl,
  packageSha256,
  existing,
  description,
  icon,
}) => {
  const entry = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    capabilities: manifest.capabilities,
    packageUrl,
    packageSha256,
  };
  const resolvedDescription = description ?? existing?.description;
  const resolvedIcon = icon ?? existing?.icon;
  if (resolvedDescription) entry.description = resolvedDescription;
  if (resolvedIcon) entry.icon = resolvedIcon;
  return entry;
};

export const publishAtom = async ({
  appRoot,
  workspace,
  catalog,
  packageDir,
  privateKeyPem,
  baseUrl,
  packageUrl,
  description,
  icon,
  now = () => new Date().toISOString(),
}) => {
  if (!workspace) throw new Error('--workspace is required');
  if (!catalog) throw new Error('--catalog is required');
  if (!privateKeyPem) throw new Error('owner private key is required');

  const workspaceRoot = resolve(workspace);
  const catalogPath = resolve(catalog);
  const outDir = resolve(packageDir ?? join(dirname(catalogPath), 'atoms'));
  const knownCapabilities = await readAtomCapabilities(resolve(appRoot));
  const manifestBytes = await readFile(join(workspaceRoot, 'manifest.json'));
  const manifest = parseManifest(JSON.parse(manifestBytes.toString('utf8')));
  const inventory = await inventoryWorkspace(workspaceRoot);
  if (!inventory || !inventory.files.includes('manifest.json')) {
    throw new Error('workspace could not be inventoried');
  }
  validateManifest(manifest, knownCapabilities, inventory.files);

  const packageFileName = `${manifest.id}-${manifest.version}.tgz`;
  const packagePath = join(outDir, packageFileName);
  const stagingDir = join(
    outDir,
    `.staging-${manifest.id}-${manifest.version}-${randomUUID()}`,
  );
  const signature = sign(null, manifestBytes, privateKeyPem);

  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
  try {
    await copyInventoriedFiles(workspaceRoot, stagingDir, inventory.files);
    await writeFile(join(stagingDir, 'manifest.sig'), signature);
    await rm(packagePath, { force: true });
    await create(
      { gzip: true, file: packagePath, cwd: stagingDir },
      [...inventory.files, 'manifest.sig'].sort(),
    );
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  }

  const packageSha256 = sha256Hex(await readFile(packagePath));
  const resolvedPackageUrl = packageUrlFor({
    packageUrl,
    baseUrl,
    packagePath,
    packageFileName,
  });
  const currentCatalog = await readCatalog(catalogPath);
  const existing = currentCatalog.atoms.find(
    (atom) => isRecord(atom) && atom.id === manifest.id,
  );
  const entry = catalogEntryFor({
    manifest,
    packageUrl: resolvedPackageUrl,
    packageSha256,
    existing,
    description,
    icon,
  });
  const atoms = [
    ...currentCatalog.atoms.filter(
      (atom) => !(isRecord(atom) && atom.id === manifest.id),
    ),
    entry,
  ].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  await writeSignedCatalog(
    catalogPath,
    {
      ...currentCatalog,
      generatedAt: now(),
      atoms,
    },
    privateKeyPem,
  );

  return { entry, packagePath, packageSha256, catalogSigPath: `${catalogPath}.sig` };
};
