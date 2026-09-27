import { describe, expect, it } from "vitest";
import { convertCurl, parseCurl, tokenize } from "./curl-to-code";

describe("tokenize", () => {
  it.each([
    [`curl 'a b' "c d" e\\ f`, ["curl", "a b", "c d", "e f"]],
    [`curl -H "X: \\"q\\" \\$HOME"`, ["curl", "-H", 'X: "q" $HOME']],
    [`curl $'it\\'s\\n\\x41\\u00e9'`, ["curl", "it's\nAé"]],
    [`curl a \\\n  b \\\r\n  c`, ["curl", "a", "b", "c"]],
    [`$ curl ''`, ["curl", ""]],
  ])("%j", (input, expected) => {
    expect(tokenize(input)).toEqual(expected);
  });

  it("rejects unclosed quotes", () => {
    expect(() => tokenize(`curl 'abc`)).toThrow("Unclosed single quote.");
    expect(() => tokenize(`curl "abc`)).toThrow("Unclosed double quote.");
  });
});

describe("parseCurl", () => {
  it("infers the method from the options", () => {
    expect(parseCurl("curl example.com").method).toBe("GET");
    expect(parseCurl("curl -d a=1 example.com").method).toBe("POST");
    expect(parseCurl("curl -I example.com").method).toBe("HEAD");
    expect(parseCurl("curl -XPATCH -d a=1 example.com").method).toBe("PATCH");
  });

  it("adds http:// to scheme-less URLs", () => {
    expect(parseCurl("curl example.com/x").url).toBe("http://example.com/x");
  });

  it("handles bundled short flags with attached values", () => {
    const req = parseCurl(`curl -sSLkXPUT -H'A: 1' https://x.test`);
    expect(req).toMatchObject({ method: "PUT", insecure: true, headers: [["A", "1"]] });
    expect(req.warnings).toEqual([]);
  });

  it("joins -d values with & and defaults Content-Type like curl", () => {
    const req = parseCurl(`curl -d a=1 -d 'b=2' https://x.test`);
    expect(req.body).toEqual({ kind: "text", text: "a=1&b=2" });
    expect(req.headers).toEqual([["Content-Type", "application/x-www-form-urlencoded"]]);
  });

  it("encodes --data-urlencode like curl and moves data to the query with -G", () => {
    const req = parseCurl(`curl -G --data-urlencode 'q=a b&c' -d n=1 https://x.test/s?x=0`);
    expect(req.url).toBe("https://x.test/s?x=0&q=a+b%26c&n=1");
    expect(req.body).toBeUndefined();
    expect(req.method).toBe("GET");
  });

  it("parses JSON bodies, and --json sets both JSON headers", () => {
    const req = parseCurl(`curl --json '{"a":[1]}' https://x.test`);
    expect(req.body).toEqual({ kind: "json", text: '{"a":[1]}', value: { a: [1] } });
    expect(req.headers).toEqual([
      ["Content-Type", "application/json"],
      ["Accept", "application/json"],
    ]);
  });

  it("falls back to a string body with a warning when JSON doesn't parse", () => {
    const req = parseCurl(`curl -H 'Content-Type: application/json' -d '{oops' https://x.test`);
    expect(req.body).toEqual({ kind: "text", text: "{oops" });
    expect(req.warnings[0]).toMatch(/doesn't parse as JSON/);
  });

  it("parses multipart fields and drops a manual multipart Content-Type", () => {
    const req = parseCurl(
      `curl -H 'Content-Type: multipart/form-data' -F name=Ada -F 'photo=@/tmp/me.png;type=image/png' https://x.test`,
    );
    expect(req.headers).toEqual([]);
    expect(req.body).toEqual({
      kind: "form",
      fields: [
        { name: "name", value: "Ada" },
        { name: "photo", file: "/tmp/me.png", contentType: "image/png" },
      ],
    });
  });

  it("maps auth, user agent, referer, and cookies", () => {
    const req = parseCurl(`curl -u ada:pa:ss -A ua -e ref -b 'a=1' --oauth2-bearer t0k https://x.test`);
    expect(req.auth).toEqual({ username: "ada", password: "pa:ss" });
    expect(req.headers).toEqual([
      ["User-Agent", "ua"],
      ["Referer", "ref"],
      ["Cookie", "a=1"],
      ["Authorization", "Bearer t0k"],
    ]);
  });

  it("warns about options it can't carry over, and ignores harmless ones", () => {
    const req = parseCurl(`curl -sS --compressed -o out.txt --frobnicate -@ https://x.test`);
    expect(req.warnings).toEqual([
      "--output isn't supported and was ignored.",
      "Unknown option --frobnicate was ignored.",
      "Unknown option -@ was ignored.",
    ]);
  });

  it.each([
    ["", "Input is empty. Paste a curl command."],
    ["wget https://x.test", 'Expected the command to start with "curl", not "wget".'],
    ["curl -s", "No URL found in the command."],
    ["curl https://x.test -H", "-H needs a value."],
  ])("rejects %j", (command, message) => {
    expect(() => parseCurl(command)).toThrow(message);
  });
});

describe("convertCurl", () => {
  const cmd = `curl -X POST https://api.test/users -H 'Content-Type: application/json' -d '{"name":"Ada","tags":["a"]}'`;

  it("emits fetch", () => {
    expect(convertCurl(cmd, "fetch")).toEqual({
      ok: true,
      warnings: [],
      code: [
        'const response = await fetch("https://api.test/users", {',
        '  method: "POST",',
        "  headers: {",
        '    "Content-Type": "application/json",',
        "  },",
        "  body: JSON.stringify({",
        '    name: "Ada",',
        "    tags: [",
        '      "a",',
        "    ],",
        "  }),",
        "});",
        "console.log(await response.text());",
        "",
      ].join("\n"),
    });
  });

  it("emits axios", () => {
    const result = convertCurl(cmd, "axios");
    expect(result.ok && result.code).toBe(
      [
        'import axios from "axios";',
        "",
        "const response = await axios({",
        '  method: "post",',
        '  url: "https://api.test/users",',
        "  headers: {",
        '    "Content-Type": "application/json",',
        "  },",
        "  data: {",
        '    name: "Ada",',
        "    tags: [",
        '      "a",',
        "    ],",
        "  },",
        "});",
        "console.log(response.data);",
        "",
      ].join("\n"),
    );
  });

  it("emits Python requests", () => {
    const result = convertCurl(cmd, "python");
    expect(result.ok && result.code).toBe(
      [
        "import requests",
        "",
        "headers = {",
        '    "Content-Type": "application/json",',
        "}",
        "",
        "json_data = {",
        '    "name": "Ada",',
        '    "tags": [',
        '        "a",',
        "    ],",
        "}",
        "",
        "response = requests.post(",
        '    "https://api.test/users",',
        "    headers=headers,",
        "    json=json_data,",
        ")",
        "print(response.text)",
        "",
      ].join("\n"),
    );
  });

  it("keeps simple GETs to one line", () => {
    const fetchResult = convertCurl("curl https://x.test", "fetch");
    const pyResult = convertCurl("curl https://x.test", "python");
    expect(fetchResult.ok && fetchResult.code).toContain('const response = await fetch("https://x.test");');
    expect(pyResult.ok && pyResult.code).toContain('response = requests.get("https://x.test")');
  });

  it("maps auth, timeout, and -k per library", () => {
    const command = "curl -k -m 2.5 -u ada:pw https://x.test";
    const f = convertCurl(command, "fetch");
    const a = convertCurl(command, "axios");
    const p = convertCurl(command, "python");
    expect(f.ok && f.code).toContain('"Authorization": "Basic YWRhOnB3"');
    expect(f.ok && f.code).toContain("signal: AbortSignal.timeout(2500)");
    expect(f.ok && f.warnings).toEqual(["fetch can't skip TLS certificate checks (curl -k); the option was dropped."]);
    expect(a.ok && a.code).toContain('auth: { username: "ada", password: "pw" }');
    expect(a.ok && a.code).toContain("httpsAgent: new https.Agent({ rejectUnauthorized: false })");
    expect(p.ok && p.code).toContain('auth=("ada", "pw"),\n    timeout=2.5,\n    verify=False,');
  });

  it("uses requests.request for non-standard methods", () => {
    const result = convertCurl("curl -X PURGE https://x.test", "python");
    expect(result.ok && result.code).toContain('response = requests.request(\n    "PURGE",\n    "https://x.test",\n)');
  });

  it("emits file uploads as TODO placeholders in JS and open() in Python", () => {
    const command = "curl -F 'doc=@./report.pdf;type=application/pdf' https://x.test";
    const f = convertCurl(command, "fetch");
    const p = convertCurl(command, "python");
    expect(f.ok && f.code).toContain(
      '// TODO: replace the empty Blob with the contents of ./report.pdf\nform.append("doc", new Blob([], { type: "application/pdf" }), "report.pdf");',
    );
    expect(p.ok && p.code).toContain('"doc": ("report.pdf", open("./report.pdf", "rb"), "application/pdf"),');
  });

  it("returns parse errors instead of throwing", () => {
    expect(convertCurl("curl 'oops", "fetch")).toEqual({ ok: false, error: "Unclosed single quote." });
  });
});
