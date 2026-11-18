#!/usr/bin/env node
// Creates a mailbox for /mail/, or resets the password of an existing one.
//   npm run mail:create -- jane@treez.tech "Jane Doe"           (live database)
//   npm run mail:create -- jane@treez.tech "Jane Doe" --local   (local development database)
// Mailboxes can also be managed in the admin workspace, under Mailboxes.
// The password is typed at a hidden prompt, and only its salted hash leaves this machine.
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { text } from 'node:stream/consumers';

const DATABASE_ID = '0603466d-5476-40f9-969e-7c6c84eb82c3';
const DOMAIN = 'treez.tech'; // Keep in step with MAIL_DOMAIN in cloudflare.config.ts.
const ITERATIONS = 100_000; // Keep in step with PBKDF2_ITERATIONS in src/auth.ts.
const MIN_LENGTH = 12;

const args = process.argv.slice(2);
const local = args.includes('--local');
const [rawAddress, ...nameParts] = args.filter((arg) => !arg.startsWith('--'));
const input = rawAddress?.trim().toLowerCase() ?? '';
const address = input.includes('@') ? input : `${input}@${DOMAIN}`;
const [localPart, domain] = address.split('@');
if (!input || domain !== DOMAIN || !/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(localPart) || localPart.includes('..')) {
  console.error(`Usage: npm run mail:create -- name@${DOMAIN} "Display Name" [--local]`);
  process.exit(1);
}
const displayName = nameParts.join(' ').trim() || localPart;

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
const password = piped ?? await askHidden(`Password for ${address} (${MIN_LENGTH}+ characters): `);
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
const now = new Date().toISOString();

// Resetting a password also signs that mailbox out everywhere. The display name is only set on creation.
const upsert = `INSERT INTO mail_accounts (id, address, display_name, password_hash, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
  ON CONFLICT (address) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`;
const signOut = 'DELETE FROM mail_sessions WHERE account_id = (SELECT id FROM mail_accounts WHERE address = ?1)';
const batch = JSON.stringify([
  { sql: upsert, params: [randomUUID(), address, displayName, stored, now] },
  { sql: signOut, params: [address] }
]);

execFileSync('cf', ['d1', 'raw', DATABASE_ID, '--batch', batch, ...(local ? ['--local', '--persist-to', '.cloudflare/state'] : [])], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`Mailbox ready: ${address}. Sign in at /mail/.`);
