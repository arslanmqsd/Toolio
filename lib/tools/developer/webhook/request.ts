/** Commands that POST a webhook to your own endpoint. Toolio only writes them; it never sends anything. */

import { quote } from "@/lib/shell-quote";

export type RequestFormat = "curl" | "powershell" | "fetch";

export interface WebhookRequest {
  url: string;
  headers: [string, string][];
  body: string;
}

/** Content-Type first, then the provider's headers in order, dropping any repeat of a name. */
export function requestHeaders(extra: [string, string][]): [string, string][] {
  const seen = new Set<string>();
  return [["Content-Type", "application/json"], ...extra].filter(([name]) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) as [string, string][];
}

function curl({ url, headers, body }: WebhookRequest): string {
  // --data-binary sends the body byte for byte, newlines included, which a signature depends on.
  return [`curl -X POST ${quote(url)}`, ...headers.map(([k, v]) => `-H ${quote(`${k}: ${v}`)}`), `--data-binary ${quote(body)}`].join(" \\\n  ");
}

const psString = (s: string) => `'${s.replace(/'/g, "''")}'`;

function powershell({ url, headers, body }: WebhookRequest): string {
  const lines = headers.filter(([k]) => k.toLowerCase() !== "content-type").map(([k, v]) => `  ${psString(k)} = ${psString(v)}`);
  // A literal here-string keeps $ and quotes as typed. Sending UTF-8 bytes stops PowerShell re-encoding the body.
  return [
    "$body = @'",
    body,
    "'@",
    "$headers = @{",
    ...lines,
    "}",
    `Invoke-RestMethod -Method Post -Uri ${psString(url)} -Headers $headers -ContentType 'application/json' \``,
    "  -Body ([System.Text.Encoding]::UTF8.GetBytes($body.Replace(\"`r`n\", \"`n\")))",
  ].join("\n");
}

function fetchCode({ url, headers, body }: WebhookRequest): string {
  const headerLines = headers.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  return [
    `const res = await fetch(${JSON.stringify(url)}, {`,
    `  method: "POST",`,
    `  headers: {`,
    ...headerLines,
    `  },`,
    `  // Send the exact string that was signed; re-serializing it can change the bytes.`,
    `  body: ${JSON.stringify(body)},`,
    `});`,
    `console.log(res.status, await res.text());`,
  ].join("\n");
}

export function buildRequest(format: RequestFormat, request: WebhookRequest): string {
  if (format === "powershell") return powershell(request);
  if (format === "fetch") return fetchCode(request);
  return curl(request);
}

/** Problems with the endpoint URL, or null when it's fine to use. */
export function checkUrl(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return "Enter a full URL, like http://localhost:3000/api/webhooks.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "The URL must start with http:// or https://.";
  if (url.username || url.password) return "Leave credentials out of the URL; they'd end up in your shell history.";
  return null;
}
