"use client";

import { useMemo, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import CodeBlock from "@/components/ui/CodeBlock";
import { CodeTextArea, codeFieldClass } from "@/components/ui/CodeField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { generateTypes, type Language } from "@/lib/tools/developer/json-to-types";

const EXAMPLE_JSON = `{
  "id": 1024,
  "username": "ada",
  "email": "ada@example.com",
  "is_active": true,
  "score": 98.5,
  "created_at": "2025-01-01T00:00:00Z",
  "profile": {
    "display_name": "Ada Lovelace",
    "avatar_url": "https://example.com/ada.png"
  },
  "tags": ["admin", "beta"],
  "orders": [
    { "order_id": "A-1", "total": 42.5, "items": 3, "shipped_at": "2025-02-01T10:00:00Z" },
    { "order_id": "A-2", "total": 10, "items": 1, "shipped_at": null, "coupon": "WELCOME10" }
  ]
}
`;

const LANGUAGES: { id: Language; label: string }[] = [
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
];

export default function JsonToTypes() {
  const [json, setJson] = useToolInput(EXAMPLE_JSON);
  const [language, setLanguage] = useState<Language>("typescript");
  const [rootName, setRootName] = useState("User");
  const result = useMemo(() => generateTypes(json, language, rootName), [json, language, rootName]);

  return (
    <>
      <InputPanel label="JSON">
        <div className="space-y-4">
          <CodeTextArea
            aria-label="JSON input"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={18}
            invalid={!result.ok}
            aria-describedby={!result.ok ? "json-to-types-error" : undefined}
          />
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="root-name" className="mb-1 block text-xs text-[color:var(--text-muted)]">
                Root type name
              </label>
              <input
                id="root-name"
                value={rootName}
                onChange={(e) => setRootName(e.target.value)}
                placeholder="Root"
                spellCheck={false}
                className={`${codeFieldClass()} px-3 py-1.5`}
              />
            </div>
            <SegmentedControl label="Output language" options={LANGUAGES} value={language} onChange={setLanguage} />
          </div>
        </div>
      </InputPanel>

      <OutputPanel label={LANGUAGES.find((l) => l.id === language)!.label} copyText={result.ok ? result.code : undefined} outputType="code">
        {result.ok ? (
          <CodeBlock code={result.code} tabSize={4} />
        ) : (
          <Alert id="json-to-types-error" title="Can't generate types">
            {result.error}
          </Alert>
        )}
      </OutputPanel>
    </>
  );
}
