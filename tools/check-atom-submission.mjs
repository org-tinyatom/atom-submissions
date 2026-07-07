// CLI for the advisory submission checks: `node scripts/check-atom-submission.mjs <submission-dir>`.
// Prints one line per finding and exits 1 when any exist. Advisory only — merging stays human.
import process from 'node:process';
import { checkSubmission } from './lib/atom-checks.mjs';

const submissionDir = process.argv[2];
if (!submissionDir) {
  console.error('usage: node scripts/check-atom-submission.mjs <submission-dir>');
  process.exit(2);
}

const { ok, findings } = await checkSubmission(submissionDir);
for (const { code, message } of findings) console.error(`[${code}] ${message}`);
console.log(ok ? 'Submission checks passed.' : `Submission checks found ${findings.length} issue(s).`);
process.exit(ok ? 0 : 1);
