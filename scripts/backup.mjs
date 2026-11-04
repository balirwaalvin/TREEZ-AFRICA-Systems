#!/usr/bin/env node
// Saves the live messages, blog posts and page views to backups/<timestamp>.json.
// Admin logins and sessions are left out on purpose, and backups/ is ignored by git.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const DATABASE_ID = '0603466d-5476-40f9-969e-7c6c84eb82c3';
const TABLES = ['messages', 'posts', 'page_views'];

const backup = { createdAt: new Date().toISOString(), tables: {} };
for (const table of TABLES) {
  const output = execFileSync('cf', ['d1', 'query', DATABASE_ID, '--sql', `SELECT * FROM ${table}`], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const rows = JSON.parse(output).flatMap((result) => result.results);
  backup.tables[table] = rows;
  console.log(`${table}: ${rows.length} rows`);
}

mkdirSync('backups', { recursive: true });
const file = `backups/${backup.createdAt.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(backup, null, 2), { mode: 0o600 });
console.log(`Saved ${file}. It contains customer details, so keep it private.`);
