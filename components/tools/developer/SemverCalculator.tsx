"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useToolInput } from "@/components/tool-shell/tool-io";
import { InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import ValueTable from "@/components/ui/ValueTable";
import { analyzeRange, bumpVersion, checkVersions, compareVersions, parseVersionList, type Comparison } from "@/lib/tools/developer/semver";

const EXAMPLE_RANGE = "^1.2.3";
const EXAMPLE_VERSIONS = ["1.2.2", "1.2.3", "1.4.0", "1.10.0", "v1.9", "1.3.0-beta.1", "2.0.0"].join("\n");

const muted = "font-[family-name:var(--font-ui)] text-sm text-[color:var(--text-muted)]";

export default function SemverCalculator() {
  const rangeRef = useRef<HTMLInputElement>(null);
  const [range, setRange] = useState(EXAMPLE_RANGE);
  const [includePrerelease, setIncludePrerelease] = useState(false);
  const [versionsText, setVersionsText] = useToolInput(EXAMPLE_VERSIONS);
  const [a, setA] = useState("1.9.0");
  const [b, setB] = useState("1.10.0");
  const [preid, setPreid] = useState("beta");

  // A pasted list can be thousands of versions; keep typing in the range responsive.
  const deferredVersions = useDeferredValue(versionsText);
  const versions = useMemo(() => parseVersionList(deferredVersions), [deferredVersions]);
  const analysis = useMemo(() => (range.trim() === "" ? null : analyzeRange(range, { includePrerelease })), [range, includePrerelease]);
  const result = useMemo(
    () => (analysis?.ok ? checkVersions(range, versions, { includePrerelease }) : null),
    [analysis, range, versions, includePrerelease],
  );

  const comparison = useMemo(() => compareVersions(a, b), [a, b]);
  const aVersion = comparison.ok ? comparison.a.split("+")[0] : null;
  const bumps = useMemo(() => (aVersion ? bumpVersion(aVersion, preid) : null), [aVersion, preid]);
  const rangeInvalid = analysis !== null && !analysis.ok;

  function clear() {
    setRange("");
    setVersionsText("");
    rangeRef.current?.focus();
  }

  const matchingList = result?.checks
    .filter((c) => c.matches && c.version.ok)
    .map((c) => (c.version.ok ? c.version.version : ""))
    .join("\n");

  return (
    <>
      <InputPanel label="Range and versions">
        <div className="space-y-4">
          <Field label="Range" htmlFor="semver-range" help="As in package.json: ^1.2.3, ~1.2, 1.x, >=1.2.0 <2.0.0, 1.0.0 - 2.0.0, joined with ||.">
            <CodeInput
              ref={rangeRef}
              id="semver-range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              placeholder="^1.2.3"
              invalid={rangeInvalid}
              aria-describedby={rangeInvalid ? "semver-range-error" : undefined}
            />
          </Field>
          <Checkbox checked={includePrerelease} onChange={setIncludePrerelease}>
            Include prereleases (like npm&apos;s --include-prerelease)
          </Checkbox>
          <Field label="Versions" htmlFor="semver-versions" help="One per line, or separated by commas or spaces.">
            <CodeTextArea id="semver-versions" value={versionsText} onChange={(e) => setVersionsText(e.target.value)} rows={9} />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" icon={X} onClick={clear} disabled={range === "" && versionsText === ""}>
              Clear
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel label="Matches" copyText={matchingList || undefined} outputType="text">
        <div className="space-y-5">
          {analysis === null ? (
            <p className={muted}>Type a range to check the versions against.</p>
          ) : !analysis.ok ? (
            <Alert id="semver-range-error" title="Invalid range">
              {analysis.error}
            </Alert>
          ) : (
            <section aria-label="What the range means" className="space-y-3">
              <p className="break-all">
                <span className="font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">Means </span>
                {analysis.normalized}
              </p>
              <ul className="space-y-2">
                {analysis.alternatives.map((alt, i) => (
                  <li key={i} className="border-l-2 border-[color:var(--border)] pl-3">
                    <p>
                      <code className="text-[color:var(--accent-text)]">{alt.source}</code>
                      <span className="font-[family-name:var(--font-ui)]"> → {alt.words}</span>
                    </p>
                    <p className="mt-0.5 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">{alt.meaning}</p>
                  </li>
                ))}
              </ul>
              {analysis.warnings.map((w) => (
                <Alert key={w} tone="warn" title="Matches everything">
                  {w}
                </Alert>
              ))}
              {!analysis.satisfiable && (
                <Alert tone="warn" title="Nothing can match">
                  No version fits this range. Check for bounds that cross, like &gt;2.0.0 &lt;1.0.0, or two exact versions with no ||.
                </Alert>
              )}
            </section>
          )}

          {result && <VersionResults result={result} total={versions.length} />}
        </div>
      </OutputPanel>

      <InputPanel label="Compare two versions">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Version A" htmlFor="semver-a">
              <CodeInput
                id="semver-a"
                value={a}
                onChange={(e) => setA(e.target.value)}
                invalid={!comparison.ok && comparison.side === "a"}
                aria-describedby={!comparison.ok && comparison.side === "a" ? "semver-compare-error" : undefined}
              />
            </Field>
            <Field label="Version B" htmlFor="semver-b">
              <CodeInput
                id="semver-b"
                value={b}
                onChange={(e) => setB(e.target.value)}
                invalid={!comparison.ok && comparison.side === "b"}
                aria-describedby={!comparison.ok && comparison.side === "b" ? "semver-compare-error" : undefined}
              />
            </Field>
          </div>
          <Field label="Prerelease tag" htmlFor="semver-preid" help="Used for the next prerelease of A, as in 1.2.4-beta.0. Leave empty for 1.2.4-0.">
            <CodeInput id="semver-preid" value={preid} onChange={(e) => setPreid(e.target.value)} invalid={bumps === null && comparison.ok} className="sm:max-w-48" />
          </Field>
        </div>
      </InputPanel>

      <OutputPanel label="Comparison" copyText={comparison.ok ? comparisonSummary(comparison) : undefined} outputType="text">
        <CompareResult comparison={comparison} rawA={a} rawB={b} bumps={bumps} />
      </OutputPanel>
    </>
  );
}

function VersionResults({ result, total }: { result: ReturnType<typeof checkVersions>; total: number }) {
  if (total === 0) return <p className={muted}>Add some versions to check.</p>;
  return (
    <section aria-label="Versions" className="space-y-3">
      <p className="font-[family-name:var(--font-ui)] text-sm" aria-live="polite">
        <span className="font-semibold">
          {result.matching.toLocaleString()} of {total.toLocaleString()} match
        </span>
        {result.highest ? (
          <span className="text-[color:var(--text-muted)]">
            . npm would install <span className="font-[family-name:var(--font-mono)] text-[color:var(--text)]">{result.highest}</span>, the newest.
          </span>
        ) : (
          <span className="text-[color:var(--text-muted)]">. npm would find nothing to install.</span>
        )}
      </p>
      <table className="w-full text-sm">
        <caption className="sr-only">Versions, newest first, and whether each is in the range</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Version</th>
            <th scope="col">In range</th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>
          {result.checks.map((check, i) => (
            <tr key={i} className="border-t border-[color:var(--border)] align-top">
              <td className="py-2 pl-1 pr-3">
                <span className={check.version.ok ? "whitespace-nowrap" : "break-all text-[color:var(--text-muted)] line-through"}>{check.version.ok ? check.version.version : check.version.input}</span>
                {check.version.ok && check.version.note && (
                  <span className="mt-0.5 block font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                    {check.version.input} · {check.version.note}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">
                {check.matches ? (
                  <Check aria-label="Yes" className="h-4 w-4 text-[color:var(--accent-text)]" />
                ) : (
                  <X aria-label="No" className="h-4 w-4 text-[color:var(--text-muted)]" />
                )}
              </td>
              <td className={`py-2 pr-1 font-[family-name:var(--font-ui)] ${check.matches ? "" : "text-[color:var(--text-muted)]"}`}>{check.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const ORDER_SIGN = { "-1": "<", "0": "=", "1": ">" } as const;

function comparisonSummary(c: Extract<Comparison, { ok: true }>): string {
  return `${c.a} ${ORDER_SIGN[c.order]} ${c.b}${c.change ? ` (${c.change})` : ""}`;
}

/** "a major update", "a prerelease change". */
function changeWords(change: string): string {
  if (change.startsWith("pre") && change !== "prerelease") return `a ${change.slice(3)} change, between prereleases`;
  return `a ${change} ${change === "prerelease" ? "change" : "update"}`;
}

function CompareResult({ comparison, rawA, rawB, bumps }: { comparison: Comparison; rawA: string; rawB: string; bumps: ReturnType<typeof bumpVersion> }) {
  if (!comparison.ok) {
    const raw = comparison.side === "a" ? rawA : rawB;
    if (raw.trim() === "") return <p className={muted}>Type two versions to compare.</p>;
    return (
      <Alert id="semver-compare-error" title={`Version ${comparison.side.toUpperCase()} isn't valid`}>
        {comparison.error}
      </Alert>
    );
  }

  const { a, b, order, change, note } = comparison;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg" aria-live="polite">
          {a} <span className="text-[color:var(--accent-text)]">{ORDER_SIGN[order]}</span> {b}
        </p>
        <p className="mt-1 font-[family-name:var(--font-ui)] text-sm">
          {order === 0
            ? "Same version."
            : `${order < 0 ? "B" : "A"} is newer: ${changeWords(change!)}.`}
        </p>
        {note && <p className={`mt-1 ${muted}`}>{note}</p>}
      </div>
      <section aria-label="Next versions after A">
        <h3 className="mb-1 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">Next versions after {a.split("+")[0]}</h3>
        {bumps ? (
          <ValueTable rows={bumps.map((bump) => ({ label: bump.label, value: bump.version }))} />
        ) : (
          <p className="font-[family-name:var(--font-ui)] text-sm text-[color:var(--error)]">
            The prerelease tag can only have letters, digits, hyphens and dots, like beta or rc.1.
          </p>
        )}
      </section>
    </div>
  );
}
