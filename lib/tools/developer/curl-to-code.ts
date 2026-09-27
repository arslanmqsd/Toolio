export type Target = "fetch" | "axios" | "python";

// ---------------------------------------------------------------------------
// Shell tokenizing (POSIX sh quoting, as used by "Copy as cURL")
// ---------------------------------------------------------------------------

const ANSI_C_ESCAPES: Record<string, string> = {
  n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", v: "\v",
  "\\": "\\", "'": "'", '"': '"', "?": "?",
};

/** Splits a shell command into arguments, handling quotes, escapes, and line continuations. */
export function tokenize(input: string): string[] {
  const s = input.replace(/^\s*\$\s+/, ""); // tolerate a pasted "$ " prompt
  const tokens: string[] = [];
  let current = "";
  let inToken = false;
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (c === "\\" && (s[i + 1] === "\n" || (s[i + 1] === "\r" && s[i + 2] === "\n"))) {
      i += s[i + 1] === "\r" ? 3 : 2;
      continue;
    }
    if (/\s/.test(c)) {
      if (inToken) tokens.push(current);
      current = "";
      inToken = false;
      i++;
      continue;
    }

    inToken = true;
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      if (end === -1) throw new Error("Unclosed single quote.");
      current += s.slice(i + 1, end);
      i = end + 1;
    } else if (c === "$" && s[i + 1] === "'") {
      i += 2;
      while (i < s.length && s[i] !== "'") {
        if (s[i] !== "\\") {
          current += s[i++];
          continue;
        }
        const next = s[i + 1];
        const hex = next === "x" ? s.slice(i + 2).match(/^[0-9a-fA-F]{1,2}/) : null;
        const uni = next === "u" ? s.slice(i + 2).match(/^[0-9a-fA-F]{1,4}/) : null;
        if (hex) {
          current += String.fromCharCode(parseInt(hex[0], 16));
          i += 2 + hex[0].length;
        } else if (uni) {
          current += String.fromCharCode(parseInt(uni[0], 16));
          i += 2 + uni[0].length;
        } else if (next !== undefined && next in ANSI_C_ESCAPES) {
          current += ANSI_C_ESCAPES[next];
          i += 2;
        } else {
          current += "\\";
          i++;
        }
      }
      if (i >= s.length) throw new Error("Unclosed $'…' quote.");
      i++;
    } else if (c === '"') {
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && '"\\$`\n'.includes(s[i + 1])) {
          if (s[i + 1] !== "\n") current += s[i + 1];
          i += 2;
        } else {
          current += s[i++];
        }
      }
      if (i >= s.length) throw new Error("Unclosed double quote.");
      i++;
    } else if (c === "\\") {
      if (i + 1 < s.length) current += s[i + 1];
      i += 2;
    } else {
      current += c;
      i++;
    }
  }
  if (inToken) tokens.push(current);
  return tokens;
}

// ---------------------------------------------------------------------------
// curl argument parsing
// ---------------------------------------------------------------------------

export interface FormField {
  name: string;
  value?: string;
  /** Path of a file to upload (curl -F name=@path). */
  file?: string;
  filename?: string;
  contentType?: string;
}

export type RequestBody =
  | { kind: "json"; text: string; value: unknown }
  | { kind: "text"; text: string }
  | { kind: "form"; fields: FormField[] };

export interface CurlRequest {
  url: string;
  method: string;
  headers: [string, string][];
  body?: RequestBody;
  auth?: { username: string; password: string };
  insecure: boolean;
  timeoutSeconds?: number;
  warnings: string[];
}

const SHORT_WITH_VALUE: Record<string, string> = {
  X: "request", H: "header", d: "data", F: "form", u: "user", A: "user-agent", e: "referer",
  b: "cookie", m: "max-time", o: "output", x: "proxy", c: "cookie-jar", T: "upload-file",
  w: "write-out", E: "cert", K: "config", r: "range", C: "continue-at", y: "speed-time",
  Y: "speed-limit", z: "time-cond", U: "proxy-user", Q: "quote", P: "ftp-port",
};

const SHORT_FLAGS: Record<string, string> = {
  G: "get", I: "head", L: "location", s: "silent", S: "show-error", v: "verbose", i: "include",
  k: "insecure", f: "fail", O: "remote-name", "#": "progress-bar", N: "no-buffer", g: "globoff",
  "0": "http1.0", "4": "ipv4", "6": "ipv6", n: "netrc", l: "list-only", R: "remote-time",
  q: "disable", j: "junk-session-cookies", J: "remote-header-name", a: "append", B: "use-ascii",
  p: "proxytunnel", Z: "parallel",
};

const LONG_WITH_VALUE = new Set([
  ...Object.values(SHORT_WITH_VALUE),
  "data-raw", "data-ascii", "data-binary", "data-urlencode", "json", "form-string", "url",
  "connect-timeout", "oauth2-bearer", "cacert", "key", "retry", "resolve", "limit-rate",
  "max-redirs", "interface", "dns-servers", "request-target", "proxy-header", "retry-delay",
  "retry-max-time", "expect100-timeout", "keepalive-time", "unix-socket", "abstract-unix-socket",
  "aws-sigv4", "pass", "cert-type", "key-type", "ciphers", "trace", "trace-ascii", "stderr",
]);

// Accepted and deliberately ignored: they don't change the request itself.
const IGNORED = new Set([
  "location", "silent", "show-error", "verbose", "include", "fail", "fail-with-body", "compressed",
  "no-progress-meter", "progress-bar", "no-buffer", "globoff", "http1.0", "http1.1", "http2",
  "http2-prior-knowledge", "http3", "ipv4", "ipv6", "max-redirs", "retry", "retry-delay",
  "retry-max-time", "connect-timeout", "keepalive-time", "tcp-nodelay", "path-as-is", "raw",
  "trace", "trace-ascii", "stderr", "limit-rate", "remote-time",
]);

// Recognised but unsupported: they would change behaviour in ways the generated code can't express.
const UNSUPPORTED = new Set([
  "output", "remote-name", "remote-header-name", "cookie-jar", "upload-file", "write-out",
  "proxy", "proxy-user", "proxy-header", "proxytunnel", "cert", "key", "cacert", "cert-type",
  "key-type", "config", "range", "continue-at", "resolve", "unix-socket", "abstract-unix-socket",
  "aws-sigv4", "netrc", "interface", "dns-servers", "request-target", "digest", "ntlm", "negotiate",
]);

function headerIndex(headers: [string, string][], name: string): number {
  return headers.findIndex(([h]) => h.toLowerCase() === name.toLowerCase());
}

function setHeader(headers: [string, string][], name: string, value: string, warnings: string[]) {
  const i = headerIndex(headers, name);
  if (i === -1) {
    headers.push([name, value]);
  } else {
    warnings.push(`Header "${name}" was given more than once; using the last value.`);
    headers[i] = [name, value];
  }
}

/** Matches curl --data-urlencode: only unreserved characters stay literal, spaces become "+". */
function urlencode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

function parseFormField(spec: string, literal: boolean, warnings: string[]): FormField | null {
  const eq = spec.indexOf("=");
  if (eq <= 0) {
    warnings.push(`Ignored form field "${spec}": expected name=value.`);
    return null;
  }
  const name = spec.slice(0, eq);
  const raw = spec.slice(eq + 1);
  if (literal || (!raw.startsWith("@") && !raw.startsWith("<"))) return { name, value: raw };

  const [path, ...params] = raw.slice(1).split(";");
  if (raw.startsWith("<")) {
    warnings.push(`Form field "${name}" reads its value from ${path}; paste the file's contents in its place.`);
    return { name, value: `<contents of ${path}>` };
  }
  const field: FormField = { name, file: path };
  for (const param of params) {
    const [key, ...rest] = param.split("=");
    if (key === "type") field.contentType = rest.join("=");
    if (key === "filename") field.filename = rest.join("=");
  }
  return field;
}

export function parseCurl(command: string): CurlRequest {
  const args = tokenize(command);
  if (args.length === 0) throw new Error("Input is empty. Paste a curl command.");
  if (args[0] !== "curl") throw new Error(`Expected the command to start with "curl", not "${args[0]}".`);

  const warnings: string[] = [];
  const headers: [string, string][] = [];
  const urls: string[] = [];
  const data: string[] = [];
  const form: FormField[] = [];
  let method: string | undefined;
  let isJson = false;
  let forceGet = false;
  let head = false;
  let insecure = false;
  let timeoutSeconds: number | undefined;
  let auth: CurlRequest["auth"];

  function apply(name: string, value: string) {
    switch (name) {
      case "request":
        method = value.toUpperCase();
        break;
      case "header": {
        const colon = value.indexOf(":");
        if (colon === -1) {
          // "Name;" sends an empty header.
          if (value.endsWith(";")) setHeader(headers, value.slice(0, -1).trim(), "", warnings);
          else warnings.push(`Ignored header "${value}": expected "Name: value".`);
          break;
        }
        const headerValue = value.slice(colon + 1).trim();
        // "Name:" with no value tells curl to drop a default header; nothing to send.
        if (headerValue !== "") setHeader(headers, value.slice(0, colon).trim(), headerValue, warnings);
        break;
      }
      case "data":
      case "data-ascii":
      case "data-binary":
        if (value.startsWith("@")) {
          warnings.push(`Request body is read from ${value.slice(1)}; paste the file's contents in its place.`);
          data.push(`<contents of ${value.slice(1)}>`);
        } else {
          data.push(value);
        }
        break;
      case "data-raw":
        data.push(value);
        break;
      case "json":
        isJson = true;
        data.push(value);
        break;
      case "data-urlencode": {
        if (value.includes("@") && !value.includes("=")) {
          warnings.push(`--data-urlencode reads from a file (${value}); paste the contents instead.`);
          break;
        }
        const eq = value.indexOf("=");
        if (eq === -1) data.push(urlencode(value));
        else if (eq === 0) data.push(urlencode(value.slice(1)));
        else data.push(`${value.slice(0, eq)}=${urlencode(value.slice(eq + 1))}`);
        break;
      }
      case "form":
      case "form-string": {
        const field = parseFormField(value, name === "form-string", warnings);
        if (field) form.push(field);
        break;
      }
      case "user": {
        const colon = value.indexOf(":");
        if (colon === -1) {
          warnings.push("No password given with -u; curl would prompt for one. Using an empty password.");
          auth = { username: value, password: "" };
        } else {
          auth = { username: value.slice(0, colon), password: value.slice(colon + 1) };
        }
        break;
      }
      case "oauth2-bearer":
        setHeader(headers, "Authorization", `Bearer ${value}`, warnings);
        break;
      case "user-agent":
        setHeader(headers, "User-Agent", value, warnings);
        break;
      case "referer":
        setHeader(headers, "Referer", value, warnings);
        break;
      case "cookie":
        if (value.includes("=")) setHeader(headers, "Cookie", value, warnings);
        else warnings.push(`Cookies are read from a file (${value}); add a Cookie header instead.`);
        break;
      case "url":
        urls.push(value);
        break;
      case "get":
        forceGet = true;
        break;
      case "head":
        head = true;
        break;
      case "insecure":
        insecure = true;
        break;
      case "max-time": {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds > 0) timeoutSeconds = seconds;
        break;
      }
      default:
        if (UNSUPPORTED.has(name)) warnings.push(`--${name} isn't supported and was ignored.`);
        else if (!IGNORED.has(name)) warnings.push(`Unknown option --${name} was ignored.`);
    }
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--") && arg.length > 2) {
      const eq = arg.indexOf("=");
      const name = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).toLowerCase();
      if (eq !== -1) {
        apply(name, arg.slice(eq + 1));
      } else if (LONG_WITH_VALUE.has(name)) {
        if (i + 1 >= args.length) throw new Error(`--${name} needs a value.`);
        apply(name, args[++i]);
      } else {
        apply(name, "");
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      // Short options can be bundled (-sSL) and take attached values (-XPOST).
      for (let j = 1; j < arg.length; j++) {
        const letter = arg[j];
        const withValue = SHORT_WITH_VALUE[letter];
        if (withValue) {
          const attached = arg.slice(j + 1);
          if (attached) {
            apply(withValue, attached);
          } else {
            if (i + 1 >= args.length) throw new Error(`-${letter} needs a value.`);
            apply(withValue, args[++i]);
          }
          break;
        }
        const flag = SHORT_FLAGS[letter];
        if (flag) apply(flag, "");
        else warnings.push(`Unknown option -${letter} was ignored.`);
      }
    } else {
      urls.push(arg);
    }
  }

  if (urls.length === 0) throw new Error("No URL found in the command.");
  if (urls.length > 1) warnings.push(`Several URLs were given; using the first (${urls[0]}).`);
  let url = /^[a-z][a-z0-9+.-]*:\/\//i.test(urls[0]) ? urls[0] : `http://${urls[0]}`;

  let body: RequestBody | undefined;
  if (forceGet) {
    if (data.length) url += (url.includes("?") ? "&" : "?") + data.join("&");
  } else if (form.length) {
    if (data.length) warnings.push("curl can't combine -d with -F; the -d data was dropped.");
    body = { kind: "form", fields: form };
    // The HTTP library must set multipart Content-Type itself, with the boundary.
    const ct = headerIndex(headers, "content-type");
    if (ct !== -1 && /multipart\/form-data/i.test(headers[ct][1])) headers.splice(ct, 1);
  } else if (data.length) {
    const text = data.join("&");
    if (headerIndex(headers, "content-type") === -1) {
      headers.push(["Content-Type", isJson ? "application/json" : "application/x-www-form-urlencoded"]);
    }
    if (isJson && headerIndex(headers, "accept") === -1) headers.push(["Accept", "application/json"]);
    const contentType = headers[headerIndex(headers, "content-type")][1];
    body = { kind: "text", text };
    if (/json/i.test(contentType)) {
      try {
        body = { kind: "json", text, value: JSON.parse(text) };
      } catch {
        warnings.push("The body is labelled JSON but doesn't parse as JSON; it's sent as a plain string.");
      }
    }
  }

  const defaultMethod = head ? "HEAD" : forceGet ? "GET" : body ? "POST" : "GET";
  return {
    url,
    method: method ?? defaultMethod,
    headers,
    body,
    auth,
    insecure,
    timeoutSeconds,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

const str = (value: string) => JSON.stringify(value);

/** Serializes a JSON value as a JS or Python literal. */
function literal(value: unknown, lang: "js" | "py", level: number): string {
  const unit = lang === "js" ? "  " : "    ";
  const pad = unit.repeat(level + 1);
  const close = unit.repeat(level);
  if (value === null) return lang === "js" ? "null" : "None";
  if (typeof value === "boolean") return lang === "js" ? String(value) : value ? "True" : "False";
  if (typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => pad + literal(v, lang, level + 1)).join(",\n")},\n${close}]`;
  }
  const entries = Object.entries(value as object);
  if (entries.length === 0) return "{}";
  const key = (k: string) => (lang === "js" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : str(k));
  return `{\n${entries.map(([k, v]) => `${pad}${key(k)}: ${literal(v, lang, level + 1)}`).join(",\n")},\n${close}}`;
}

function jsHeaders(headers: [string, string][], level: number): string {
  const pad = "  ".repeat(level + 1);
  return `{\n${headers.map(([k, v]) => `${pad}${str(k)}: ${str(v)},`).join("\n")}\n${"  ".repeat(level)}}`;
}

function jsFormLines(fields: FormField[]): string[] {
  const lines = ["const form = new FormData();"];
  for (const f of fields) {
    if (f.file !== undefined) {
      const name = f.filename ?? f.file.split("/").pop();
      const type = f.contentType ? `, { type: ${str(f.contentType)} }` : "";
      lines.push(`// TODO: replace the empty Blob with the contents of ${f.file}`);
      lines.push(`form.append(${str(f.name)}, new Blob([]${type}), ${str(name ?? f.name)});`);
    } else {
      lines.push(`form.append(${str(f.name)}, ${str(f.value ?? "")});`);
    }
  }
  return lines;
}

function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}

function emitFetch(req: CurlRequest): { code: string; warnings: string[] } {
  const warnings: string[] = [];
  const pre: string[] = [];
  const opts: string[] = [];
  const headers = [...req.headers];

  if (req.auth && headerIndex(headers, "authorization") === -1) {
    headers.push(["Authorization", `Basic ${base64(`${req.auth.username}:${req.auth.password}`)}`]);
  }
  if (req.method !== "GET") opts.push(`method: ${str(req.method)}`);
  if (headers.length) opts.push(`headers: ${jsHeaders(headers, 1)}`);
  if (req.body?.kind === "json") opts.push(`body: JSON.stringify(${literal(req.body.value, "js", 1)})`);
  if (req.body?.kind === "text") opts.push(`body: ${str(req.body.text)}`);
  if (req.body?.kind === "form") {
    pre.push(...jsFormLines(req.body.fields), "");
    opts.push("body: form");
  }
  if (req.timeoutSeconds) opts.push(`signal: AbortSignal.timeout(${Math.round(req.timeoutSeconds * 1000)})`);
  if (req.insecure) warnings.push("fetch can't skip TLS certificate checks (curl -k); the option was dropped.");

  const call = opts.length
    ? `const response = await fetch(${str(req.url)}, {\n${opts.map((o) => `  ${o},`).join("\n")}\n});`
    : `const response = await fetch(${str(req.url)});`;
  return { code: [...pre, call, "console.log(await response.text());", ""].join("\n"), warnings };
}

function emitAxios(req: CurlRequest): { code: string; warnings: string[] } {
  const imports = ['import axios from "axios";'];
  const pre: string[] = [];
  const opts: string[] = [];

  if (req.method !== "GET") opts.push(`method: ${str(req.method.toLowerCase())}`);
  opts.push(`url: ${str(req.url)}`);
  if (req.headers.length) opts.push(`headers: ${jsHeaders(req.headers, 1)}`);
  if (req.body?.kind === "json") opts.push(`data: ${literal(req.body.value, "js", 1)}`);
  if (req.body?.kind === "text") opts.push(`data: ${str(req.body.text)}`);
  if (req.body?.kind === "form") {
    pre.push(...jsFormLines(req.body.fields), "");
    opts.push("data: form");
  }
  if (req.auth) opts.push(`auth: { username: ${str(req.auth.username)}, password: ${str(req.auth.password)} }`);
  if (req.timeoutSeconds) opts.push(`timeout: ${Math.round(req.timeoutSeconds * 1000)}`);
  if (req.insecure) {
    imports.push('import https from "node:https";');
    opts.push("httpsAgent: new https.Agent({ rejectUnauthorized: false })");
  }

  const call = `const response = await axios({\n${opts.map((o) => `  ${o},`).join("\n")}\n});`;
  return {
    code: [...imports, "", ...pre, call, "console.log(response.data);", ""].join("\n"),
    warnings: req.insecure ? ["Skipping TLS checks with httpsAgent works in Node.js only, not browsers."] : [],
  };
}

const REQUESTS_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function emitPython(req: CurlRequest): { code: string; warnings: string[] } {
  const blocks: string[] = [];
  const args: string[] = [str(req.url)];

  if (req.headers.length) {
    blocks.push(`headers = {\n${req.headers.map(([k, v]) => `    ${str(k)}: ${str(v)},`).join("\n")}\n}`);
    args.push("headers=headers");
  }
  if (req.body?.kind === "json") {
    blocks.push(`json_data = ${literal(req.body.value, "py", 0)}`);
    args.push("json=json_data");
  }
  if (req.body?.kind === "text") {
    blocks.push(`data = ${str(req.body.text)}`);
    args.push("data=data");
  }
  if (req.body?.kind === "form") {
    const lines = req.body.fields.map((f) => {
      if (f.file === undefined) return `    ${str(f.name)}: (None, ${str(f.value ?? "")}),`;
      const name = f.filename ?? f.file.split("/").pop() ?? f.name;
      const type = f.contentType ? `, ${str(f.contentType)}` : "";
      return `    ${str(f.name)}: (${str(name)}, open(${str(f.file)}, "rb")${type}),`;
    });
    blocks.push(`files = {\n${lines.join("\n")}\n}`);
    args.push("files=files");
  }
  if (req.auth) args.push(`auth=(${str(req.auth.username)}, ${str(req.auth.password)})`);
  if (req.timeoutSeconds) args.push(`timeout=${req.timeoutSeconds}`);
  if (req.insecure) args.push("verify=False");

  const fn = REQUESTS_METHODS.has(req.method)
    ? `requests.${req.method.toLowerCase()}`
    : (args.splice(0, 0, str(req.method)), "requests.request");
  const call =
    args.length === 1 ? `response = ${fn}(${args[0]})` : `response = ${fn}(\n${args.map((a) => `    ${a},`).join("\n")}\n)`;

  return { code: ["import requests", "", ...blocks.flatMap((b) => [b, ""]), call, "print(response.text)", ""].join("\n"), warnings: [] };
}

const emitters: Record<Target, (req: CurlRequest) => { code: string; warnings: string[] }> = {
  fetch: emitFetch,
  axios: emitAxios,
  python: emitPython,
};

export type ConvertResult = { ok: true; code: string; warnings: string[] } | { ok: false; error: string };

export function convertCurl(command: string, target: Target): ConvertResult {
  let req: CurlRequest;
  try {
    req = parseCurl(command);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const { code, warnings } = emitters[target](req);
  return { ok: true, code, warnings: [...req.warnings, ...warnings] };
}
