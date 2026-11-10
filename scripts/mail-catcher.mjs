#!/usr/bin/env node
// A local stand-in for Titan's mail server, for trying receipts without emailing anyone.
//   npm run mail-catcher        (terminal 1: listens on 127.0.0.1:2525)
//   npm run dev:mail-test       (terminal 2: the site, sending receipts here)
// Every email the site sends is saved to mail-catcher/<time>.eml, which opens in any mail app.
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 2525;
const OUT = join(process.cwd(), 'mail-catcher');
mkdirSync(OUT, { recursive: true });

createServer((socket) => {
  let buffer = '';
  let data = null; // collecting a message body after DATA
  const reply = (line) => socket.write(`${line}\r\n`);
  reply('220 mail-catcher ready');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('latin1');
    for (;;) {
      if (data !== null) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        data += buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        const file = join(OUT, `${new Date().toISOString().replace(/[:.]/g, '-')}.eml`);
        // Undo the sender's dot-stuffing.
        writeFileSync(file, Buffer.from(data.replace(/^\.\./gm, '.'), 'latin1'));
        console.log(`saved ${file}`);
        data = null;
        reply('250 Queued');
        continue;
      }
      const end = buffer.indexOf('\r\n');
      if (end === -1) return;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const command = line.toUpperCase();
      console.log(`> ${command.startsWith('AUTH') ? 'AUTH …' : line}`);
      if (command.startsWith('EHLO')) { reply('250-mail-catcher'); reply('250 AUTH PLAIN'); }
      else if (command.startsWith('AUTH')) reply('235 Accepted');
      else if (command.startsWith('MAIL FROM') || command.startsWith('RCPT TO')) reply('250 OK');
      else if (command === 'DATA') { data = ''; reply('354 Send the message, end with .'); }
      else if (command === 'QUIT') { reply('221 Bye'); socket.end(); return; }
      else reply('502 Not supported');
    }
  });
  socket.on('error', () => {});
}).listen(PORT, '127.0.0.1', () => console.log(`Mail catcher listening on 127.0.0.1:${PORT}, saving to ${OUT}`));
