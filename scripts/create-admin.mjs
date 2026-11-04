#!/usr/bin/env node
// Creates an admin, or resets the password of an existing one.
//   npm run admin:create -- you@example.com            (live database)
//   npm run admin:create -- you@example.com --local    (local development database)
// The password is typed at a hidden prompt, and only its salted hash leaves this machine.
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { text } from 'node:stream/consumers';

const DATABASE_ID = '0603466d-5476-40f9-969e-7c6c84eb82c3';
const ITERATIONS = 100_000; // Keep in step with PBKDF2_ITERATIONS in src/auth.ts.
const MIN_LENGTH = 12;

const args = process.argv.slice(2);
const local = args.includes('--local');
const email = args.find((arg) => !arg.startsWith('--'))?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run admin:create -- you@example.com [--local]');
  process.exit(1);
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    rl._writeToOutput = () => {}; // Set after the prompt is printed, so keystrokes aren't echoed.
  });
}

// Piped input (used by automated tests) supplies the password once, on the first line.
const piped = process.stdin.isTTY ? null : (await text(process.stdin)).split('\n')[0];
const password = piped ?? await askHidden(`Password for ${email} (${MIN_LENGTH}+ characters): `);
if (password.length < MIN_LENGTH) {
  console.error(`Use at least ${MIN_LENGTH} characters.`);
  process.exit(1);
}
if (piped === null && password !== await askHidden('Type it again: ')) {
  console.error('The passwords did not match.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
const stored = `pbkdf2-sha256$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;

// A password reset also signs that admin out everywhere.
const upsert = `INSERT INTO admins (id, email, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)
  ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash`;
const signOut = 'DELETE FROM sessions WHERE admin_id = (SELECT id FROM admins WHERE email = ?1)';
const batch = JSON.stringify([
  { sql: upsert, params: [randomUUID(), email, stored, new Date().toISOString()] },
  { sql: signOut, params: [email] }
]);

execFileSync('cf', ['d1', 'raw', DATABASE_ID, '--batch', batch, ...(local ? ['--local', '--persist-to', '.cloudflare/state'] : [])], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`Admin ready: ${email}. Sign in at /admin/.`);
