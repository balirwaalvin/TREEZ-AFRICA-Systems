import { connect } from "cloudflare:sockets";

/**
 * A minimal SMTP client for sending through a mailbox provider (Titan) from a Worker.
 * It speaks implicit TLS (port 465) and AUTH PLAIN, which is all Titan needs.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** Implicit TLS from the first byte. Only turned off for a local test server. */
  secure: boolean;
}

export interface Attachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
}

export interface Mail {
  from: { name: string; email: string };
  to: string;
  /** Delivered to, but never shown in the headers. */
  bcc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Attachment[];
}

/** Thrown for anything the mail server refuses. `code` is the SMTP reply code, or 0 for connection problems. */
export class SmtpError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 20_000;
const CRLF = "\r\n";

export async function sendMail(config: SmtpConfig, mail: Mail): Promise<void> {
  const socket = connect({ hostname: config.host, port: config.port }, { secureTransport: config.secure ? "on" : "off", allowHalfOpen: false });
  const session = new Session(socket);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SmtpError(0, "The mail server took too long to answer.")), TIMEOUT_MS);
  });
  try {
    await Promise.race([deliver(session, config, mail), timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
    await socket.close().catch(() => {});
  }
}

async function deliver(session: Session, config: SmtpConfig, mail: Mail): Promise<void> {
  await session.expect(220);
  await session.command(`EHLO ${domainOf(config.user)}`, 250);
  await session.command(`AUTH PLAIN ${base64(new TextEncoder().encode(`\0${config.user}\0${config.password}`))}`, 235);
  await session.command(`MAIL FROM:<${config.user}>`, 250);
  for (const recipient of [mail.to, ...(mail.bcc ?? [])]) await session.command(`RCPT TO:<${recipient}>`, [250, 251]);
  await session.command("DATA", 354);
  // Lines starting with "." are doubled so they can't end the message early (RFC 5321 §4.5.2).
  const body = buildMessage(mail, config.user).replace(/^\./gm, "..");
  await session.command(`${body}${CRLF}.`, 250);
  await session.command("QUIT", 221).catch(() => {});
}

class Session {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private buffer = "";

  constructor(socket: Socket) {
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  async command(line: string, expected: number | number[]): Promise<string> {
    await this.writer.write(new TextEncoder().encode(line + CRLF));
    return this.expect(expected);
  }

  /** Reads one reply, which may span several "250-…" lines ending with "250 …". */
  async expect(expected: number | number[]): Promise<string> {
    const lines: string[] = [];
    for (;;) {
      const line = await this.readLine();
      lines.push(line);
      if (line.length < 4 || line[3] !== "-") break;
    }
    const last = lines[lines.length - 1]!;
    const code = Number(last.slice(0, 3));
    const text = lines.map((item) => item.slice(4)).join(" ");
    if (!(Array.isArray(expected) ? expected : [expected]).includes(code)) throw new SmtpError(code || 0, text || "The mail server sent an unexpected reply.");
    return text;
  }

  private async readLine(): Promise<string> {
    for (;;) {
      const end = this.buffer.indexOf(CRLF);
      if (end !== -1) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 2);
        return line;
      }
      const { value, done } = await this.reader.read();
      if (done) throw new SmtpError(0, "The mail server closed the connection.");
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }
}

export function buildMessage(mail: Mail, envelopeFrom: string): string {
  const boundary = `mixed_${crypto.randomUUID()}`;
  const alternative = `alt_${crypto.randomUUID()}`;
  const headers = [
    `From: ${address(mail.from.name, mail.from.email)}`,
    `To: <${clean(mail.to)}>`,
    mail.replyTo ? `Reply-To: <${clean(mail.replyTo)}>` : "",
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domainOf(envelopeFrom)}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter(Boolean);

  const parts = [
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    `--${alternative}`,
    ...encodedPart("text/plain; charset=utf-8", new TextEncoder().encode(mail.text)),
    `--${alternative}`,
    ...encodedPart("text/html; charset=utf-8", new TextEncoder().encode(mail.html)),
    `--${alternative}--`,
  ];
  for (const file of mail.attachments ?? []) {
    const name = clean(file.filename).replace(/"/g, "");
    parts.push(
      `--${boundary}`,
      ...encodedPart(`${clean(file.contentType)}; name="${name}"`, file.content, `Content-Disposition: attachment; filename="${name}"`),
    );
  }
  parts.push(`--${boundary}--`);
  return [...headers, "", ...parts].join(CRLF);
}

function encodedPart(contentType: string, content: Uint8Array, extraHeader?: string): string[] {
  return [
    `Content-Type: ${contentType}`,
    "Content-Transfer-Encoding: base64",
    ...(extraHeader ? [extraHeader] : []),
    "",
    ...(base64(content).match(/.{1,76}/g) ?? [""]),
  ];
}

/** Header values come from form input, so line breaks are removed to stop header injection. */
const clean = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

function address(name: string, email: string): string {
  return `${encodeHeader(name.replace(/"/g, ""))} <${clean(email)}>`;
}

/** Plain ASCII passes through; anything else becomes an RFC 2047 encoded word. */
function encodeHeader(value: string): string {
  const cleaned = clean(value);
  return /^[\x20-\x7e]*$/.test(cleaned) ? cleaned : `=?UTF-8?B?${base64(new TextEncoder().encode(cleaned))}?=`;
}

function domainOf(email: string): string {
  return email.split("@")[1] || "localhost";
}

export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
