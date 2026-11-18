/** Plain-text helpers for snippets, search and quoting. Nothing here produces HTML for display. */

const MAX_HTML_FOR_TEXT = 400_000;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** A rough plain-text version of an HTML email, for emails sent without one. */
export function htmlToText(html: string): string {
  return html
    .slice(0, MAX_HTML_FOR_TEXT)
    .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first line or two of an email, for the message list. */
export function snippetOf(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.startsWith(">"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

/** Turns an (already escaped) URL into a link, leaving trailing punctuation and quotes outside it. */
function linkify(match: string): string {
  const tail = match.match(/(?:&quot;|&#39;|&gt;|&lt;|[.,;:!?)\]])+$/)?.[0] ?? "";
  const url = match.slice(0, match.length - tail.length);
  return `<a href="${url}">${url}</a>${tail}`;
}

/** The HTML part sent alongside a plain-text email: the same words, links clickable, quotes indented. */
export function textToHtml(text: string): string {
  const blocks: string[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (!quote.length) return;
    blocks.push(`<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555">${textToHtml(quote.join("\n"))}</blockquote>`);
    quote = [];
  };
  for (const line of text.split("\n")) {
    if (line.startsWith(">")) {
      quote.push(line.replace(/^> ?/, ""));
      continue;
    }
    flush();
    blocks.push(`${escapeHtml(line).replace(/\bhttps?:\/\/[^\s<>"']+/g, linkify)}<br>`);
  }
  flush();
  return blocks.join("\n");
}

export function emailHtml(text: string): string {
  return `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">${textToHtml(text)}</div></body></html>`;
}
