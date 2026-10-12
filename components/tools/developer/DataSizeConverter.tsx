"use client";

import { useMemo, useState } from "react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import { CodeInput } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import FormError from "@/components/ui/FormError";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import ValueTable from "@/components/ui/ValueTable";
import {
  convert,
  formatBest,
  formatRatio,
  formatTransferTime,
  parseSize,
  parseSpeed,
  transferSeconds,
  unitById,
  UNITS,
  type UnitSystem,
} from "@/lib/tools/developer/data-size";

const EXAMPLE = "1 TB";

const PRECISIONS = [
  { id: "2", label: "2 places" },
  { id: "4", label: "4 places" },
  { id: "exact", label: "Exact" },
] as const;

type Precision = (typeof PRECISIONS)[number]["id"];

const COMMON_SPEEDS = ["10 Mbps", "100 Mbps", "1 Gbps", "10 Gbps"];

const GROUPS: { system: UnitSystem; title: string; help: string }[] = [
  { system: "byte", title: "Bytes and bits", help: "1 byte = 8 bits." },
  { system: "decimal", title: "Decimal (SI)", help: "Powers of 1,000: 1 KB = 1,000 bytes. Used by drive makers, macOS, iOS and most specs." },
  { system: "binary", title: "Binary (IEC)", help: "Powers of 1,024: 1 KiB = 1,024 bytes. What Windows and RAM sizes mean by “KB” and “GB”." },
  { system: "bits", title: "Bits", help: "Powers of 1,000 bits. Network speeds use these: 100 Mbit/s moves 12.5 MB a second." },
];

export default function DataSizeConverter() {
  const [text, setText] = useToolInput(EXAMPLE);
  const [fallbackId, setFallbackId] = useState("B");
  const [precision, setPrecision] = useState<Precision>("2");
  const [speedText, setSpeedText] = useState("100 Mbps");
  const speed = useMemo(() => parseSpeed(speedText), [speedText]);
  const fallback = unitById(fallbackId)!;
  const result = useMemo(() => parseSize(text, fallback), [text, fallback]);
  const decimals = precision === "exact" ? "exact" : Number(precision);

  const view = useMemo(() => {
    if (!result.ok) return null;
    const rows = UNITS.map((unit) => {
      const amount = convert(result.bits, unit);
      return { unit, ...formatRatio(amount, decimals), plain: formatRatio(amount, decimals, { grouping: false }).text };
    });
    return { rows, rounded: rows.some((r) => !r.exact), copyText: rows.map((r) => `${r.plain} ${r.unit.id}`).join("\n") };
  }, [result, decimals]);

  const times = useMemo(() => {
    if (!result.ok) return [];
    const yours = speed.ok ? [{ label: speedText.trim(), bitsPerSecond: speed.bitsPerSecond, yours: true }] : [];
    const common = COMMON_SPEEDS.flatMap((label) => {
      const parsed = parseSpeed(label);
      return parsed.ok ? [{ label, bitsPerSecond: parsed.bitsPerSecond, yours: false }] : [];
    })
      // Skip a common speed that's the same as the one typed.
      .filter((c) => !yours.some((y) => y.bitsPerSecond.n * c.bitsPerSecond.d === c.bitsPerSecond.n * y.bitsPerSecond.d));
    return [...yours, ...common].map((s) => ({
      key: s.yours ? "yours" : s.label,
      label: `${s.label} (${formatBest(s.bitsPerSecond, "decimal")}/s)`,
      value: formatTransferTime(transferSeconds(result.bits, s.bitsPerSecond)),
      highlight: s.yours ? ("match" as const) : undefined,
    }));
  }, [result, speed, speedText]);

  function changeUnit(id: string) {
    // A unit typed in the box wins, so swap it there; otherwise the menu sets the unit for a bare number.
    if (result.ok && result.typedUnit) setText(`${result.amountText} ${id}`);
    else setFallbackId(id);
  }

  return (
    <>
      <InputPanel label="Size">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Field label="Size" htmlFor="data-size-input" help="A number, with a unit if you like: 1.5 GiB, 500MB, 100 Mbps.">
              <CodeInput
                id="data-size-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                invalid={!result.ok}
                aria-describedby={!result.ok ? "data-size-error" : undefined}
                placeholder="1.5 GiB"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Unit" htmlFor="data-size-unit" help={result.ok && result.typedUnit ? "From what you typed." : "For a number without one."}>
              <Select id="data-size-unit" value={result.ok ? result.unit.id : fallbackId} onChange={(e) => changeUnit(e.target.value)}>
                {GROUPS.map((g) => (
                  <optgroup key={g.system} label={g.title}>
                    {UNITS.filter((u) => u.system === g.system).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.id} ({u.name})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Decimal places">
            <SegmentedControl label="Decimal places" options={PRECISIONS} value={precision} onChange={setPrecision} />
          </Field>

          <div className="space-y-2">
            <Field label="Transfer speed" htmlFor="data-size-speed" help="Download, upload or copy speed: 100 Mbps, 12.5 MB/s, 1 Gbps. A bare number is Mbps.">
              <CodeInput
                id="data-size-speed"
                value={speedText}
                onChange={(e) => setSpeedText(e.target.value)}
                invalid={!speed.ok}
                aria-describedby={!speed.ok ? "data-size-speed-error" : undefined}
                placeholder="100 Mbps"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            {!speed.ok && <FormError id="data-size-speed-error">{speed.error}</FormError>}
          </div>

          <div className="space-y-2 border-t border-[color:var(--border)] pt-4 text-sm text-[color:var(--text-muted)]">
            <p className="font-medium text-[color:var(--text)]">Why does a 1 TB drive show as 931 GB?</p>
            <p>
              Drive makers count in powers of 1,000, so 1 TB is 1,000,000,000,000 bytes. Windows counts in powers of 1,024 but still writes “GB”, so the
              same bytes show as 931 GB. They’re really 931 GiB. Nothing is missing.
            </p>
          </div>
        </div>
      </InputPanel>

      <OutputPanel label="Converted" copyText={view?.copyText}>
        {result.ok && view ? (
          <div className="space-y-6 font-[family-name:var(--font-ui)]">
            <div>
              <p className="text-lg font-semibold">
                {formatRatio(result.amount, "exact").text} {result.unit.id} ={" "}
                <span className="font-[family-name:var(--font-mono)]">{formatRatio(convert(result.bits, unitById("B")!), decimals).text}</span> bytes
              </p>
              <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                Shown as {formatBest(result.bits, "decimal")} by drive makers and macOS, and as {formatBest(result.bits, "binary").replace("iB", "B")} by
                Windows ({formatBest(result.bits, "binary")}).
              </p>
              {result.note && <p className="mt-2 text-sm text-[color:var(--accent-warn-text)]">{result.note}</p>}
            </div>

            {GROUPS.map((g) => (
              <section key={g.system} aria-labelledby={`data-size-${g.system}`}>
                <h3 id={`data-size-${g.system}`} className="text-sm font-semibold">
                  {g.title}
                </h3>
                <p className="mb-2 text-xs text-[color:var(--text-muted)]">{g.help}</p>
                <div className="font-[family-name:var(--font-mono)]">
                  <ValueTable
                    rows={view.rows
                      .filter((r) => r.unit.system === g.system)
                      .map((r) => ({
                        key: r.unit.id,
                        label: (
                          <>
                            {r.unit.id} <span className="sr-only sm:not-sr-only">({r.unit.name})</span>
                          </>
                        ),
                        value: r.text,
                        highlight: r.unit.id === result.unit.id ? "match" : undefined,
                      }))}
                  />
                </div>
              </section>
            ))}

            <section aria-labelledby="data-size-time">
              <h3 id="data-size-time" className="text-sm font-semibold">
                Transfer time
              </h3>
              <p className="mb-2 text-xs text-[color:var(--text-muted)]">
                At full speed. Real transfers take longer: protocol overhead costs around 5–10%, and Wi-Fi, disks or the server are often slower than the link.
              </p>
              <div className="font-[family-name:var(--font-mono)]">
                <ValueTable rows={times} />
              </div>
            </section>

            {view.rounded && <p className="text-xs text-[color:var(--text-muted)]">Some values are rounded. Choose Exact to see every digit.</p>}
          </div>
        ) : (
          !result.ok && (
            <Alert id="data-size-error" title={text.trim() ? "Can't read this size" : "Nothing to convert"}>
              {result.error}
            </Alert>
          )
        )}
      </OutputPanel>
    </>
  );
}
