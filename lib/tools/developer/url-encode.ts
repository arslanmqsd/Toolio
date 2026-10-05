/** How text is percent-encoded. */
export type UrlScheme = "component" | "uri" | "form";

export type UrlResult = { ok: true; output: string } | { ok: false; error: string; offset: number };

function firstLoneSurrogate(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
        continue;
      }
      return i;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return i;
  }
  return -1;
}

export function encodeUrl(text: string, scheme: UrlScheme): UrlResult {
  const lone = firstLoneSurrogate(text);
  if (lone !== -1) {
    return { ok: false, error: `Position ${lone} has a broken character (an unpaired surrogate) that can't be encoded.`, offset: lone };
  }
  if (scheme === "component") return { ok: true, output: encodeURIComponent(text) };
  if (scheme === "uri") return { ok: true, output: encodeURI(text) };
  // application/x-www-form-urlencoded: only A–Z a–z 0–9 * - . _ stay literal; spaces become "+".
  const output = encodeURIComponent(text)
    .replace(/[!'()~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
  return { ok: true, output };
}

/** Finds the first malformed escape, so errors can say where the problem is. */
function findMalformed(text: string): { error: string; offset: number } | null {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "%") continue;
    const start = i;
    const bytes: number[] = [];
    while (text[i] === "%") {
      if (!/^[0-9a-fA-F]{2}$/.test(text.slice(i + 1, i + 3))) {
        return { error: `"%" at position ${i} isn't followed by two hex digits.`, offset: i };
      }
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 3;
    }
    try {
      decoder.decode(new Uint8Array(bytes));
    } catch {
      return { error: `The escapes starting at position ${start} aren't valid UTF-8 text.`, offset: start };
    }
    i--;
  }
  return null;
}

export function decodeUrl(text: string, scheme: UrlScheme): UrlResult {
  const source = scheme === "form" ? text.replace(/\+/g, " ") : text;
  const malformed = findMalformed(source);
  if (malformed) return { ok: false, ...malformed };
  return { ok: true, output: scheme === "uri" ? decodeURI(source) : decodeURIComponent(source) };
}

/** True when text still contains percent-escapes that would decode to something. */
export function looksEncoded(text: string): boolean {
  return /%[0-9a-fA-F]{2}/.test(text) && findMalformed(text) === null;
}
