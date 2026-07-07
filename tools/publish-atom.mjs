#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishAtom } from './lib/atom-publish.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(scriptDir, '..');

const takeValue = (argv, index, name) => {
  const value = argv[index + 1];
  if (!value) throw new Error(`${name} needs a value`);
  return value;
};

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--workspace') {
      args.workspace = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--catalog') {
      args.catalog = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--package-dir') {
      args.packageDir = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--base-url') {
      args.baseUrl = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--package-url') {
      args.packageUrl = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--private-key') {
      args.privateKeyPath = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--description') {
      args.description = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === '--icon') {
      args.icon = takeValue(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
};

const readPrivateKeyPem = async (privateKeyPath) => {
  const inline = process.env.TINYATOM_OWNER_PRIVATE_KEY_PEM?.trim();
  if (inline) return inline;
  const path = privateKeyPath ?? process.env.TINYATOM_OWNER_PRIVATE_KEY_PATH;
  if (!path) throw new Error('Pass --private-key or set TINYATOM_OWNER_PRIVATE_KEY_PATH.');
  return readFile(path, 'utf8');
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const privateKeyPem = await readPrivateKeyPem(args.privateKeyPath);
  const result = await publishAtom({ appRoot, ...args, privateKeyPem });
  console.log(`Published ${result.entry.id}@${result.entry.version}`);
  console.log(`  package: ${result.packagePath}`);
  console.log(`  url:     ${result.entry.packageUrl}`);
  console.log(`  sha256:  ${result.packageSha256}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
