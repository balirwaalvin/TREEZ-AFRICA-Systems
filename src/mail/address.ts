import { HttpError } from "../http.ts";

export interface Address {
  name: string;
  address: string;
}

const EMAIL = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

/** "Jane Doe <jane@example.com>", "\"Doe, Jane\" <jane@example.com>" or "jane@example.com". */
export function parseAddress(value: string): Address | null {
  const trimmed = value.trim();
  const angled = trimmed.match(/^(.*?)\s*<([^<>]+)>$/);
  const address = (angled ? angled[2]! : trimmed).trim();
  if (!EMAIL.test(address)) return null;
  const name = (angled ? angled[1]! : "").trim().replace(/^"(.*)"$/, "$1").replace(/\\(.)/g, "$1");
  return { name, address };
}

/** Formats an address for a From/To header, quoting the name when it needs it. */
export function formatAddress({ name, address }: Address): string {
  if (!name) return address;
  const safe = name.replace(/[\r\n]/g, " ").trim();
  return /^[\w\s.'-]+$/.test(safe) ? `${safe} <${address}>` : `"${safe.replace(/(["\\])/g, "\\$1")}" <${address}>`;
}

/** Reads a list of recipients from a request body, refusing anything that isn't a real address. */
export function recipients(body: Record<string, unknown>, field: string, label: string): string[] {
  const raw = body[field] ?? [];
  if (!Array.isArray(raw) || raw.length > 50) throw new HttpError(400, `${label} is not valid.`);
  return raw.map((entry) => {
    const parsed = typeof entry === "string" && entry.length <= 320 && !/[\r\n]/.test(entry) ? parseAddress(entry) : null;
    if (!parsed) throw new HttpError(400, `"${String(entry).slice(0, 80)}" in ${label} is not a valid email address.`);
    return formatAddress(parsed);
  });
}

/** Lower-cased address part of each entry, skipping anything unreadable. */
export function addressesOf(values: unknown): string[] {
  if (!Array.isArray(values)) values = typeof values === "string" ? [values] : [];
  return (values as unknown[])
    .map((value) => (typeof value === "string" ? parseAddress(value)?.address.toLowerCase() : undefined))
    .filter((value): value is string => !!value);
}

/**
 * The mailbox an incoming address belongs to: jane@treez.tech, and also jane@<sub>.treez.tech,
 * so mail can arrive through a receiving subdomain (or be forwarded to one) and still be filed.
 */
export function mailboxFor(address: string, domain: string): string | null {
  const [local, host] = address.toLowerCase().split("@");
  if (!local || !host) return null;
  const root = domain.toLowerCase();
  return host === root || host.endsWith(`.${root}`) ? `${local}@${root}` : null;
}
