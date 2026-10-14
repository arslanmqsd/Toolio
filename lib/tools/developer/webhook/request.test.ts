import { describe, expect, it } from "vitest";
import { parseJson } from "@/lib/tools/developer/json-format";
import { buildRequest, checkUrl, requestHeaders } from "./request";
import { TEMPLATES, templateText } from "./templates";

const req = { url: "http://localhost:3000/api/webhooks", headers: requestHeaders([["X-Hub-Signature-256", "sha256=ab"], ["content-type", "text/plain"]]), body: `{"msg":"it's $HOME"}` };

describe("requestHeaders", () => {
  it("starts with Content-Type and drops repeated names", () => {
    expect(req.headers).toEqual([
      ["Content-Type", "application/json"],
      ["X-Hub-Signature-256", "sha256=ab"],
    ]);
  });
});

describe("buildRequest", () => {
  it("writes curl with every part quoted for the shell", () => {
    expect(buildRequest("curl", req)).toBe(
      `curl -X POST http://localhost:3000/api/webhooks \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Hub-Signature-256: sha256=ab' \\\n  --data-binary '{"msg":"it'\\''s $HOME"}'`,
    );
  });

  it("writes PowerShell with a literal here-string", () => {
    const ps = buildRequest("powershell", req);
    expect(ps).toContain(`$body = @'\n{"msg":"it's $HOME"}\n'@`);
    expect(ps).toContain(`  'X-Hub-Signature-256' = 'sha256=ab'`);
    expect(ps).not.toContain("'Content-Type' =");
  });

  it("writes fetch with the body as an exact string", () => {
    const js = buildRequest("fetch", req);
    expect(js).toContain(`body: "{\\"msg\\":\\"it's $HOME\\"}",`);
    expect(js).toContain(`"X-Hub-Signature-256": "sha256=ab",`);
  });
});

describe("checkUrl", () => {
  it("wants a plain http(s) URL", () => {
    expect(checkUrl("http://localhost:3000/hook")).toBeNull();
    expect(checkUrl("localhost:3000")).toMatch(/http/);
    expect(checkUrl("ftp://x")).toMatch(/http/);
    expect(checkUrl("https://user:pw@example.com")).toMatch(/credentials/);
  });
});

describe("templates", () => {
  it("are all valid JSON with unique ids", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect(parseJson(templateText(t)).ok).toBe(true);
  });
});
