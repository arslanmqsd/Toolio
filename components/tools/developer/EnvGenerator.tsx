"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import CodeBlock from "@/components/ui/CodeBlock";
import { CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import { generateEnvCode, type EnvField, type EnvTarget } from "@/lib/tools/developer/env-codegen";
import { ENV_TYPES, checkValue, inferSecret, inferType, parseEnv, type EnvType } from "@/lib/tools/developer/env-parse";

const EXAMPLE = `# App
APP_NAME=my-app
PORT=3000
DEBUG=false
ALLOWED_ORIGINS=https://example.com,https://staging.example.com

# Services
DATABASE_URL=postgres://app:change-me@localhost:5432/app
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=sk_test_123
FEATURE_FLAGS={"newCheckout":true}
SENTRY_DSN=
`;

const LANGUAGES = [
  { id: "ts", label: "TypeScript" },
  { id: "py", label: "Python" },
  { id: "example", label: ".env.example" },
] as const;

const TS_STYLES = [
  { id: "zod", label: "Zod" },
  { id: "typescript", label: "No dependencies" },
] as const;

const PY_STYLES = [
  { id: "pydantic", label: "pydantic-settings" },
  { id: "python", label: "No dependencies" },
] as const;

const FILE_NAMES: Record<EnvTarget, string> = {
  zod: "env.ts",
  typescript: "env.ts",
  pydantic: "settings.py",
  python: "settings.py",
  example: ".env.example",
};

type Language = (typeof LANGUAGES)[number]["id"];
type Override = Partial<Pick<EnvField, "type" | "required" | "secret">>;

export default function EnvGenerator() {
  const [text, setText] = useToolInput(EXAMPLE);
  const deferredText = useDeferredValue(text);
  const [language, setLanguage] = useState<Language>("ts");
  const [tsStyle, setTsStyle] = useState<(typeof TS_STYLES)[number]["id"]>("zod");
  const [pyStyle, setPyStyle] = useState<(typeof PY_STYLES)[number]["id"]>("pydantic");
  // Edits to inferred settings, keyed by variable name so they survive further typing.
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  const { vars, issues } = useMemo(() => parseEnv(deferredText), [deferredText]);
  const fields: EnvField[] = useMemo(
    () =>
      vars.map((v) => ({
        key: v.key,
        value: v.value,
        type: inferType(v.key, v.value),
        // A blank value usually means "optional" or "fill in later"; filled ones are required.
        required: v.value !== "",
        secret: inferSecret(v.key, v.value),
        ...overrides[v.key],
      })),
    [vars, overrides],
  );

  const target: EnvTarget = language === "ts" ? tsStyle : language === "py" ? pyStyle : "example";
  const code = useMemo(() => (fields.length ? generateEnvCode(fields, target) : ""), [fields, target]);

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const edited = fields.some((f) => overrides[f.key]);

  function override(key: string, change: Override) {
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }));
  }

  return (
    <>
      <InputPanel label=".env">
        <div className="space-y-5">
          <Field label="Paste your .env" htmlFor="env-input" help="Values stay in your browser. They're never written into the generated code.">
            <CodeTextArea
              id="env-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              invalid={errors.length > 0}
              aria-describedby={issues.length ? "env-issues" : undefined}
              placeholder="KEY=value"
            />
          </Field>

          {issues.length > 0 && (
            <div id="env-issues" className="space-y-3">
              {errors.length > 0 && (
                <Alert title={errors.length === 1 ? "1 line skipped" : `${errors.length} lines skipped`}>
                  <IssueList issues={errors} />
                </Alert>
              )}
              {warnings.length > 0 && (
                <Alert tone="warn" title={warnings.length === 1 ? "1 warning" : `${warnings.length} warnings`}>
                  <IssueList issues={warnings} />
                </Alert>
              )}
            </div>
          )}

          {fields.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">Variables</h3>
                {edited && (
                  <Button size="sm" icon={RotateCcw} onClick={() => setOverrides({})}>
                    Reset to detected
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[color:var(--text-muted)]">
                      <th scope="col" className="pb-2 pr-3 font-normal">
                        Name
                      </th>
                      <th scope="col" className="pb-2 pr-3 font-normal">
                        Type
                      </th>
                      <th scope="col" className="pb-2 pr-3 text-center font-normal">
                        Required
                      </th>
                      <th scope="col" className="pb-2 text-center font-normal">
                        Secret
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => {
                      const problem = checkValue(f.type, f.value);
                      return (
                        <tr key={f.key} className="border-t border-[color:var(--border)] align-top">
                          <th scope="row" className="py-2 pr-3 text-left font-[family-name:var(--font-mono)] font-normal">
                            <span className="break-all">{f.key}</span>
                            {problem && (
                              <span className="mt-1 flex items-center gap-1 font-[family-name:var(--font-ui)] text-xs text-[color:var(--accent-warn-text)]">
                                <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                                {problem}
                              </span>
                            )}
                          </th>
                          <td className="py-2 pr-3">
                            <Select
                              aria-label={`${f.key} type`}
                              value={f.type}
                              onChange={(e) => override(f.key, { type: e.target.value as EnvType })}
                              className="w-40"
                            >
                              {ENV_TYPES.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.label}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex justify-center pt-2">
                              <Checkbox checked={f.required} onChange={(required) => override(f.key, { required })}>
                                <span className="sr-only">{f.key} is required</span>
                              </Checkbox>
                            </div>
                          </td>
                          <td className="py-2">
                            <div className="flex justify-center pt-2">
                              <Checkbox checked={f.secret} onChange={(secret) => override(f.key, { secret })}>
                                <span className="sr-only">{f.key} is a secret</span>
                              </Checkbox>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </InputPanel>

      <OutputPanel label={FILE_NAMES[target]} copyText={code || undefined} outputType={target === "example" ? "env" : "code"}>
        <div className="mb-4 flex flex-wrap items-center gap-3 font-[family-name:var(--font-ui)]">
          <SegmentedControl label="Output" options={LANGUAGES} value={language} onChange={setLanguage} />
          {language === "ts" && <SegmentedControl label="TypeScript style" options={TS_STYLES} value={tsStyle} onChange={setTsStyle} />}
          {language === "py" && <SegmentedControl label="Python style" options={PY_STYLES} value={pyStyle} onChange={setPyStyle} />}
        </div>
        {code ? (
          <CodeBlock code={code} tabSize={language === "py" ? 4 : 2} />
        ) : (
          <p className="font-[family-name:var(--font-ui)] text-[color:var(--text-muted)]">
            Paste KEY=value lines on the left to generate a typed config loader.
          </p>
        )}
      </OutputPanel>
    </>
  );
}

function IssueList({ issues }: { issues: { line: number; message: string }[] }) {
  return (
    <ul className="mt-1 space-y-0.5 text-sm">
      {issues.map((issue, i) => (
        <li key={i}>
          <span className="text-[color:var(--text-muted)]">Line {issue.line}:</span> {issue.message}
        </li>
      ))}
    </ul>
  );
}
