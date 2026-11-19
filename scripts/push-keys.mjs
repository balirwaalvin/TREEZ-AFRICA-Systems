#!/usr/bin/env node
// Makes the key pair that signs mail.treez.tech's notifications (Web Push "VAPID" keys) and
// stores it as the Worker secrets VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY:
//   npm run push:keys
// Run it once. Running it again makes a new pair, and every device has to turn notifications on
// again (the mail app does this by itself the next time it's opened), so it refuses unless --replace.
// The private key is never printed; a copy is kept in .env.local (gitignored), like the Resend keys.
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const WORKER = 'treez-africa-systems';
const LOCAL = '.env.local';
const replace = process.argv.includes('--replace');

if (!replace && existsSync(LOCAL) && /^VAPID_PRIVATE_KEY=/m.test(readFileSync(LOCAL, 'utf8'))) {
  console.error(`${LOCAL} already has push keys. Run with --replace to make new ones.`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
// Browsers want the public key as an uncompressed point: 0x04 || x || y.
const publicRaw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]).toString('base64url');

for (const [name, value] of [['VAPID_PUBLIC_KEY', publicRaw], ['VAPID_PRIVATE_KEY', priv.d]]) {
  execFileSync('npx', ['cf', 'workers', 'secrets', 'update', name, '--worker', WORKER, '--type', 'secret_text', '--text', value, '--quiet'], {
    stdio: ['ignore', 'ignore', 'inherit']
  });
  console.log(`Set ${name}.`);
}
appendFileSync(LOCAL, `\n# Web Push keys for mail.treez.tech notifications (${new Date().toISOString().slice(0, 10)})\nVAPID_PUBLIC_KEY=${publicRaw}\nVAPID_PRIVATE_KEY=${priv.d}\n`);
console.log(`Saved a copy in ${LOCAL}. Notifications are ready: turn them on in the mail app's Settings.`);
