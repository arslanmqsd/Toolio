import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateEnvCode, pythonName, type EnvField } from "./env-codegen";
import { parseEnv } from "./env-parse";

const FIELDS: EnvField[] = [
  { key: "APP_NAME", type: "string", required: true, secret: false, value: "Toolio" },
  { key: "PORT", type: "port", required: true, secret: false, value: "3000" },
  { key: "WORKERS", type: "integer", required: true, secret: false, value: "4" },
  { key: "SAMPLE_RATE", type: "number", required: true, secret: false, value: "0.25" },
  { key: "DEBUG", type: "boolean", required: true, secret: false, value: "true" },
  { key: "DATABASE_URL", type: "url", required: true, secret: true, value: "postgres://u:hunter2@db:5432/app" },
  { key: "ADMIN_EMAIL", type: "email", required: true, secret: false, value: "ops@example.com" },
  { key: "FLAGS", type: "json", required: true, secret: false, value: '{"beta":true}' },
  { key: "ALLOWED_ORIGINS", type: "list", required: true, secret: false, value: "https://a.test, https://b.test" },
  { key: "API_KEY", type: "string", required: true, secret: true, value: "sk_live_123" },
  { key: "SENTRY_DSN", type: "url", required: false, secret: true, value: "" },
];

const GOOD_ENV = Object.fromEntries(FIELDS.filter((f) => f.value).map((f) => [f.key, f.value]));

const EXPECTED = {
  APP_NAME: "Toolio",
  PORT: 3000,
  WORKERS: 4,
  SAMPLE_RATE: 0.25,
  DEBUG: true,
  DATABASE_URL: "postgres://u:hunter2@db:5432/app",
  ADMIN_EMAIL: "ops@example.com",
  FLAGS: { beta: true },
  ALLOWED_ORIGINS: ["https://a.test", "https://b.test"],
  API_KEY: "sk_live_123",
};

const dir = mkdtempSync(join(tmpdir(), "toolio-env-"));

function run(command: string, args: string[], file: string, code: string, env: Record<string, string>) {
  writeFileSync(join(dir, file), code);
  return spawnSync(command, [...args, join(dir, file)], { env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
}

const hasPython = (() => {
  try {
    execFileSync("python3", ["--version"]);
    return true;
  } catch {
    return false;
  }
})();

describe("generateEnvCode: generated code runs", () => {
  const ts = generateEnvCode(FIELDS, "typescript");

  it("TypeScript loader parses every type", () => {
    const result = run("node", ["--experimental-strip-types", "--no-warnings"], "ok.ts", `${ts}\nconsole.log(JSON.stringify(env));\n`, GOOD_ENV);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual(EXPECTED);
  });

  it("TypeScript loader reports every problem at once, without echoing values", () => {
    const bad = { ...GOOD_ENV, PORT: "99999", DEBUG: "maybe", FLAGS: "{", API_KEY: "" };
    const result = run("node", ["--experimental-strip-types", "--no-warnings"], "bad.ts", ts, bad);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("PORT must be a port from 1 to 65535");
    expect(result.stderr).toContain("DEBUG must be true or false");
    expect(result.stderr).toContain("FLAGS must be valid JSON");
    expect(result.stderr).toContain("API_KEY is missing");
    expect(result.stderr).not.toContain("99999");
  });

  it.skipIf(!hasPython)("Python loader parses every type", () => {
    const py = generateEnvCode(FIELDS, "python");
    const result = run("python3", [], "ok.py", `${py}\nimport dataclasses, json\nprint(json.dumps(dataclasses.asdict(settings)))\n`, GOOD_ENV);
    expect(result.stderr).toBe("");
    const expected = Object.fromEntries(Object.entries(EXPECTED).map(([k, v]) => [pythonName(k), v]));
    expect(JSON.parse(result.stdout)).toEqual({ ...expected, sentry_dsn: null });
  });

  it.skipIf(!hasPython)("Python loader reports every problem at once, without echoing values", () => {
    const py = generateEnvCode(FIELDS, "python");
    const result = run("python3", [], "bad.py", py, { ...GOOD_ENV, WORKERS: "four", DATABASE_URL: "nope", ADMIN_EMAIL: "" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("WORKERS must be a whole number");
    expect(result.stderr).toContain("DATABASE_URL must be a full URL");
    expect(result.stderr).toContain("ADMIN_EMAIL is missing");
    expect(result.stderr).not.toContain("four");
  });
});

describe("generateEnvCode: library targets", () => {
  it("Zod schema uses string-safe parsers, not z.coerce.boolean", () => {
    const code = generateEnvCode(FIELDS, "zod");
    expect(code).toContain('import { z } from "zod";');
    expect(code).toContain("PORT: port,");
    expect(code).toContain("DEBUG: boolean,");
    expect(code).toContain("SENTRY_DSN: optional(z.string().url()),");
    expect(code).toContain("APP_NAME: z.string().min(1),");
    expect(code.replace(/\/\/.*$/gm, "")).not.toContain("coerce.boolean");
    expect(code).toContain("export type Env = z.infer<typeof EnvSchema>;");
  });

  it("pydantic settings use SecretStr, constraints and optional defaults", () => {
    const code = generateEnvCode(FIELDS, "pydantic");
    expect(code).toContain("class Settings(BaseSettings):");
    expect(code).toContain("hide_input_in_errors=True");
    expect(code).toContain("port: int = Field(ge=1, le=65535)");
    expect(code).toContain("api_key: SecretStr");
    expect(code).toContain("sentry_dsn: AnyUrl | None = None");
    expect(code).toContain("allowed_origins: Annotated[list[str], NoDecode]");
    expect(code).toContain("flags: Json[Any]");
    expect(code).toContain('# Requires: pip install pydantic-settings "pydantic[email]"');
  });

  it("renames Python keywords and keeps the env name as an alias", () => {
    const code = generateEnvCode([{ key: "CLASS", type: "string", required: true, secret: false, value: "x" }], "pydantic");
    expect(code).toContain('class_: str = Field(validation_alias="CLASS")');
  });

  it("only emits helpers that are used", () => {
    const code = generateEnvCode([{ key: "NAME", type: "string", required: true, secret: false, value: "x" }], "typescript");
    expect(code).not.toContain("function port");
    expect(code).not.toContain("function json");
  });

  it("never embeds pasted values in code", () => {
    for (const target of ["zod", "typescript", "pydantic", "python"] as const) {
      const code = generateEnvCode(FIELDS, target);
      expect(code, target).not.toContain("hunter2");
      expect(code, target).not.toContain("sk_live_123");
      expect(code, target).not.toContain("Toolio\"");
    }
  });
});

describe("generateEnvCode: .env.example", () => {
  const example = generateEnvCode(FIELDS, "example");

  it("blanks secrets and keeps safe example values", () => {
    expect(example).toContain("API_KEY=\n");
    expect(example).toContain("DATABASE_URL=\n");
    expect(example).toContain("PORT=3000\n");
    expect(example).not.toContain("hunter2");
  });

  it("round-trips through the parser", () => {
    const parsed = Object.fromEntries(parseEnv(example).vars.map((v) => [v.key, v.value]));
    for (const field of FIELDS) expect(parsed[field.key], field.key).toBe(field.secret ? "" : field.value);
  });

  it("quotes values that need it", () => {
    const tricky = generateEnvCode([{ key: "MOTD", type: "string", required: true, secret: false, value: 'hi # "there"\nbye' }], "example");
    expect(parseEnv(tricky).vars[0].value).toBe('hi # "there"\nbye');
  });
});
