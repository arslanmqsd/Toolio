"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import {
  MAX_UUIDS,
  createUuidGenerator,
  formatUuid,
  formatUuidList,
  uuidTimestamp,
  type UuidListFormat,
  type UuidVersion,
} from "@/lib/tools/developer/uuid";

const VERSIONS = [
  { id: "v4", label: "v4" },
  { id: "v7", label: "v7" },
  { id: "v1", label: "v1" },
] as const;

const VERSION_HELP: Record<UuidVersion, string> = {
  v4: "Fully random. The usual choice when you just need a unique id.",
  v7: "Starts with a timestamp, so ids sort by creation time. Good for database keys.",
  v1: "Timestamp plus a node id. Uses a random node id here, not your MAC address.",
};

const LIST_FORMATS = [
  { id: "lines", label: "Lines" },
  { id: "json", label: "JSON" },
  { id: "csv", label: "CSV" },
] as const;

export default function UuidGenerator() {
  const [version, setVersion] = useState<UuidVersion>("v4");
  const [countText, setCountText] = useState("5");
  const [uppercase, setUppercase] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [braces, setBraces] = useState(false);
  const [listFormat, setListFormat] = useState<UuidListFormat>("lines");
  const [round, setRound] = useState(0);
  // Random output would differ between server and browser, so ids are made after mount.
  const [ids, setIds] = useState<string[]>([]);

  const count = Number(countText);
  const countValid = Number.isInteger(count) && count >= 1 && count <= MAX_UUIDS;

  useEffect(() => {
    if (!countValid) return;
    const next = createUuidGenerator(version);
    setIds(Array.from({ length: count }, next));
  }, [version, count, countValid, round]);

  const formatted = formatUuidList(
    ids.map((id) => formatUuid(id, { uppercase, hyphens, braces })),
    listFormat,
  );
  const createdAt = ids.length === 1 ? uuidTimestamp(ids[0]) : null;

  return (
    <>
      <InputPanel label="Options">
        <div className="space-y-5">
          <Field label="Version" help={VERSION_HELP[version]}>
            <SegmentedControl label="Version" options={VERSIONS} value={version} onChange={setVersion} />
          </Field>

          <Field label="How many" htmlFor="uuid-count" help={`Up to ${MAX_UUIDS.toLocaleString("en")} at a time.`}>
            <CodeInput
              id="uuid-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_UUIDS}
              value={countText}
              onChange={(e) => setCountText(e.target.value)}
              invalid={!countValid}
              aria-describedby={countValid ? undefined : "uuid-count-error"}
              className="max-w-40"
            />
          </Field>

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Checkbox checked={uppercase} onChange={setUppercase}>
              Uppercase
            </Checkbox>
            <Checkbox checked={hyphens} onChange={setHyphens}>
              Hyphens
            </Checkbox>
            <Checkbox checked={braces} onChange={setBraces}>
              {"{Braces}"}
            </Checkbox>
          </div>

          {count > 1 && (
            <Field label="List format">
              <SegmentedControl label="List format" options={LIST_FORMATS} value={listFormat} onChange={setListFormat} />
            </Field>
          )}

          <Button icon={RefreshCw} onClick={() => setRound((r) => r + 1)} disabled={!countValid}>
            Generate new
          </Button>
        </div>
      </InputPanel>

      <OutputPanel label={count === 1 ? "UUID" : "UUIDs"} copyText={countValid && ids.length ? formatted : undefined}>
        {countValid ? (
          <>
            <pre className="whitespace-pre-wrap break-all">{formatted}</pre>
            {createdAt !== null && (
              <p className="mt-4 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                Embedded time: {new Date(createdAt).toISOString()}
              </p>
            )}
          </>
        ) : (
          <Alert id="uuid-count-error" title="Can't generate">
            Enter a whole number from 1 to {MAX_UUIDS.toLocaleString("en")}.
          </Alert>
        )}
      </OutputPanel>
    </>
  );
}
