/** What a variable's value should be parsed as. */
export type EnvType = "string" | "integer" | "number" | "boolean" | "url" | "port" | "email" | "json" | "list";

export const ENV_TYPES: readonly { id: EnvType; label: string }[] = [
  { id: "string", label: "Text" },
  { id: "integer", label: "Integer" },
  { id: "number", label: "Number" },
  { id: "boolean", label: "Boolean" },
  { id: "url", label: "URL" },
  { id: "port", label: "Port" },
  { id: "email", label: "Email" },
  { id: "json", label: "JSON" },
  { id: "list", label: "List (comma-separated)" },
];

export interface EnvVar {
  key: string;
  value: string;
  /** 1-based line where the key first appears. */
  line: number;
}

export interface EnvIssue {
  line: number;
  severity: "error" | "warning";
  message: string;
}

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };

/**
 * Parses .env text the way dotenv does: `export` prefixes, '…' and `…` literals, "…" with escapes,
 * multi-line quoted values, and ` #` comments after unquoted values.
 */
export function parseEnv(text: string): { vars: EnvVar[]; issues: EnvIssue[] } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const byKey = new Map<string, EnvVar>();
  const issues: EnvIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^(?:export\s+)?([^=\s]+)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) {
      issues.push({ line: lineNo, severity: "error", message: "Expected KEY=value." });
      continue;
    }
    const [, key, rest] = match;
    if (!KEY.test(key)) {
      issues.push({ line: lineNo, severity: "error", message: `${key} isn't a valid name. Use letters, digits and _, not starting with a digit.` });
      continue;
    }

    let value: string;
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      // Scan for the closing quote, continuing onto later lines if needed.
      let body = rest.slice(1);
      let end = findClose(body, quote);
      let j = i;
      while (end === -1 && j + 1 < lines.length) {
        j++;
        body += `\n${lines[j]}`;
        end = findClose(body, quote);
      }
      if (end === -1) {
        issues.push({ line: lineNo, severity: "error", message: `The ${quote} opened here is never closed.` });
        continue;
      }
      i = j;
      const after = body.slice(end + 1).trim();
      if (after && !after.startsWith("#")) issues.push({ line: lineNo, severity: "warning", message: "Text after the closing quote is ignored." });
      value = body.slice(0, end);
      if (quote === '"') value = value.replace(/\\(.)/g, (whole, c: string) => ESCAPES[c] ?? whole);
    } else {
      value = rest.replace(/\s+#.*$/, "").trim();
    }

    const existing = byKey.get(key);
    if (existing) {
      issues.push({ line: lineNo, severity: "warning", message: `${key} is set again here; the last value (line ${lineNo}) wins.` });
      existing.value = value;
    } else {
      byKey.set(key, { key, value, line: lineNo });
    }
  }
  return { vars: [...byKey.values()], issues };
}

function findClose(body: string, quote: string): number {
  for (let i = 0; i < body.length; i++) {
    if (quote === '"' && body[i] === "\\") i++;
    else if (body[i] === quote) return i;
  }
  return -1;
}

const INTEGER = /^-?\d+$/;
const NUMBER = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const BOOLEAN = /^(true|false|1|0)$/i;
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isJson(value: string): boolean {
  if (!/^[[{]/.test(value)) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/** Best guess at a variable's type from its name and example value. */
export function inferType(key: string, value: string): EnvType {
  if (!value) return "string";
  if (/^(true|false)$/i.test(value)) return "boolean";
  if (INTEGER.test(value)) {
    // Leading zeros usually mean a code or file mode, which parsing as a number would mangle.
    if (/^-?0\d/.test(value)) return "string";
    const n = Number(value);
    return /PORT$/i.test(key) && n >= 1 && n <= 65535 ? "port" : "integer";
  }
  if (NUMBER.test(value)) return "number";
  if (value.includes(",") && !isJson(value)) {
    const parts = value.split(",").map((part) => part.trim());
    // One URL with commas in its query (?ids=1,2) stays a URL; several URLs are a list.
    if (!URL_LIKE.test(value) || parts.every((part) => URL_LIKE.test(part))) return "list";
  }
  if (URL_LIKE.test(value)) return "url";
  if (EMAIL.test(value)) return "email";
  if (isJson(value)) return "json";
  return "string";
}

const SECRET_KEY = /(SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|PRIVATE|API_?KEY|ACCESS_?KEY|CREDENTIAL|AUTH|SALT|SIGNING|DSN)(?!_?(TTL|EXPIRY|EXPIRES|LIFETIME|TIMEOUT|SECONDS|MINUTES|HOURS|URL|ENDPOINT|HEADER))/i;

/** True when a variable probably holds a secret: by its name, or a password inside a URL. */
export function inferSecret(key: string, value: string): boolean {
  if (SECRET_KEY.test(key)) return true;
  return /^[a-z][a-z0-9+.-]*:\/\/[^/@\s:]*:[^/@\s]+@/i.test(value);
}

/** Why `value` isn't a valid `type`, or null if it's fine. Empty values are left to the required check. */
export function checkValue(type: EnvType, value: string): string | null {
  if (value === "") return null;
  switch (type) {
    case "integer":
      return INTEGER.test(value) ? null : "Not a whole number.";
    case "port":
      return INTEGER.test(value) && Number(value) >= 1 && Number(value) <= 65535 ? null : "Ports go from 1 to 65535.";
    case "number":
      return NUMBER.test(value) ? null : "Not a number.";
    case "boolean":
      return BOOLEAN.test(value) ? null : "Use true or false.";
    case "url":
      return URL_LIKE.test(value) ? null : "Not a full URL (it needs a scheme like https://).";
    case "email":
      return EMAIL.test(value) ? null : "Not an email address.";
    case "json":
      try {
        JSON.parse(value);
        return null;
      } catch {
        return "Not valid JSON.";
      }
    default:
      return null;
  }
}
