#!/usr/bin/env node
// Saves the live messages, blog posts and page views to a timestamped JSON file.
// Admin logins and sessions are left out on purpose, and backups/ is ignored by git.
//
//   node scripts/backup.mjs                            saves to backups/ and deletes nothing
//   node scripts/backup.mjs --dir backups/daily --keep 30   also deletes all but the newest 30 in that folder
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const DATABASE_ID = '0603466d-5476-40f9-969e-7c6c84eb82c3';
const TABLES = ['messages', 'posts', 'page_views'];
const PROJECT_DIR = fileURLToPath(new URL('..', import.meta.url));
const BACKUP_FILE = /^\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/;

const { values: options } = parseArgs({ options: { dir: { type: 'string', default: 'backups' }, keep: { type: 'string' } } });
const keep = options.keep === undefined ? undefined : Number(options.keep);
if (keep !== undefined && (!Number.isInteger(keep) || keep < 1)) {
  throw new Error('--keep must be a whole number of at least 1');
}
const directory = resolve(PROJECT_DIR, options.dir);

const backup = { createdAt: new Date().toISOString(), tables: {} };
for (const table of TABLES) {
  const output = execFileSync('cf', ['d1', 'query', DATABASE_ID, '--sql', `SELECT * FROM ${table}`], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const rows = JSON.parse(output).flatMap((result) => result.results);
  backup.tables[table] = rows;
  console.log(`${table}: ${rows.length} rows`);
}

mkdirSync(directory, { recursive: true, mode: 0o700 });
const file = join(directory, `${backup.createdAt.replace(/[:.]/g, '-')}.json`);
// Written under a temporary name first, so a failed write never looks like a finished backup.
writeFileSync(`${file}.tmp`, JSON.stringify(backup, null, 2), { mode: 0o600 });
renameSync(`${file}.tmp`, file);
console.log(`Saved ${file}. It contains customer details, so keep it private.`);

if (keep !== undefined) {
  const expired = readdirSync(directory).filter((name) => BACKUP_FILE.test(name)).sort().slice(0, -keep);
  for (const name of expired) rmSync(join(directory, name));
  if (expired.length > 0) console.log(`Deleted ${expired.length} older backup(s), keeping the newest ${keep}.`);
}
