/**
 * Data size conversion with exact arithmetic. Amounts are kept as fractions
 * of bits in BigInt, so 1 PiB is exactly 1,125,899,906,842,624 bytes and
 * 0.1 MB is exactly 100,000 bytes. Every unit is a power of 2 times a power
 * of 10, so every result has a finite decimal expansion.
 */

export type UnitSystem = "byte" | "decimal" | "binary" | "bits";

export interface DataUnit {
  id: string;
  /** Plural name, e.g. "gibibytes". */
  name: string;
  system: UnitSystem;
  bits: bigint;
}

/** base^exp. BigInt `**` and literals need ES2020; the project targets ES2017. */
export function pow(base: bigint, exp: number): bigint {
  let result = BigInt(1);
  for (let i = 0; i < exp; i++) result *= base;
  return result;
}

const [ZERO, ONE, TWO, FIVE, TEN] = [0, 1, 2, 5, 10].map(BigInt);
const KILO = BigInt(1000);
const KIBI = BigInt(1024);
const PREFIXES = [
  ["K", "kilo", "kibi"],
  ["M", "mega", "mebi"],
  ["G", "giga", "gibi"],
  ["T", "tera", "tebi"],
  ["P", "peta", "pebi"],
  ["E", "exa", "exbi"],
] as const;

export const UNITS: DataUnit[] = [
  { id: "B", name: "bytes", system: "byte", bits: BigInt(8) },
  { id: "bit", name: "bits", system: "byte", bits: ONE },
  ...PREFIXES.map(([p, si], i) => ({ id: `${p}B`, name: `${si}bytes`, system: "decimal" as const, bits: BigInt(8) * pow(KILO, i + 1) })),
  ...PREFIXES.map(([p, , bi], i) => ({ id: `${p}iB`, name: `${bi}bytes`, system: "binary" as const, bits: BigInt(8) * pow(KIBI, i + 1) })),
  ...PREFIXES.slice(0, 4).map(([p, si], i) => ({ id: `${p === "K" ? "k" : p}bit`, name: `${si}bits`, system: "bits" as const, bits: pow(KILO, i + 1) })),
];

export const unitById = (id: string) => UNITS.find((u) => u.id === id);

/** A non-negative fraction: n / d. */
export interface Ratio {
  n: bigint;
  d: bigint;
}

const gcd = (a: bigint, b: bigint): bigint => (b === ZERO ? a : gcd(b, a % b));
function ratio(n: bigint, d: bigint): Ratio {
  const g = gcd(n, d) || ONE;
  return { n: n / g, d: d / g };
}

/** Parses "1,024", "1.5", ".5" or "2e9" into an exact fraction. */
export function parseAmount(text: string): Ratio | null {
  const m = /^(\d[\d,_]*|\d*(?=\.\d))(?:\.(\d*))?(?:[eE]([+-]?\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const whole = m[1].replace(/[,_]/g, "");
  const frac = m[2] ?? "";
  const exp = Number(m[3] ?? 0) - frac.length;
  const digits = BigInt((whole || "0") + frac);
  return exp >= 0 ? ratio(digits * pow(TEN, exp), ONE) : ratio(digits, pow(TEN, -exp));
}

const WORDS = new Map<string, string>([
  ["b", "B"], ["byte", "B"], ["bytes", "B"], ["octet", "B"], ["octets", "B"],
  ["bit", "bit"], ["bits", "bit"],
]);
for (const [p, si, bi] of PREFIXES) {
  const bit = unitById(`${p === "K" ? "k" : p}bit`);
  for (const [word, id] of [[`${si}byte`, `${p}B`], [`${bi}byte`, `${p}iB`], ...(bit ? [[`${si}bit`, bit.id]] : [])]) {
    WORDS.set(word, id);
    WORDS.set(`${word}s`, id);
  }
}

export interface UnitMatch {
  unit: DataUnit;
  /** Set when the spelling was ambiguous and we picked one reading. */
  note?: string;
}

/** Reads a unit as typed: case matters for B (bytes) vs b (bits), except in all-lowercase, which people mostly mean as bytes. */
export function parseUnit(text: string): UnitMatch | null {
  const word = WORDS.get(text.toLowerCase());
  if (word && text.length > 1) return { unit: unitById(word)! };
  if (text === "B") return { unit: unitById("B")! };
  if (text === "b") return { unit: unitById("bit")! };

  const m = /^([kKMGTPE])(i?)(B|b|bit|bits|bps|Byte|Bytes)?$/i.exec(text);
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const binary = m[2] !== "";
  const suffix = m[3] ?? "B";
  const lower = text === text.toLowerCase();
  const bits = /^(bits?|bps)$/i.test(suffix) || (suffix === "b" && !lower);

  if (bits) {
    const unit = unitById(`${prefix === "K" ? "k" : prefix}bit`);
    if (!unit || binary) return null;
    return { unit };
  }
  const unit = unitById(binary ? `${prefix}iB` : `${prefix}B`)!;
  const note =
    lower && suffix === "b" && !binary
      ? `Read “${text}” as ${unit.name}. Write ${prefix}b or ${prefix === "K" ? "k" : prefix}bit for ${unit.name.replace("bytes", "bits")}.`
      : undefined;
  return { unit, note };
}

export type ParseResult =
  | { ok: true; bits: Ratio; amount: Ratio; amountText: string; unit: DataUnit; typedUnit: boolean; note?: string }
  | { ok: false; error: string };

/** Reads "1.5 GiB", "500MB" or a bare number in the fallback unit. */
export function parseSize(text: string, fallback: DataUnit): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Enter a size, like 1.5 GiB or 500 MB." };
  if (trimmed.startsWith("-")) return { ok: false, error: "Sizes can't be negative." };
  const m = /^\+?([\d.,_]*\d[\d.,_]*(?:[eE][+-]?\d+)?|\.\d+)\s*([A-Za-z]*)$/.exec(trimmed);
  const amount = m && parseAmount(m[1]);
  if (!m || !amount) return { ok: false, error: `“${trimmed}” isn't a number with an optional unit, like 1.5 GiB or 500 MB.` };
  let unit = fallback;
  let note: string | undefined;
  if (m[2]) {
    const match = parseUnit(m[2]);
    if (!match) return { ok: false, error: `Unknown unit “${m[2]}”. Try B, KB, MB, GB, TB, KiB, MiB, GiB, TiB, bit, Mbit or Gbit.` };
    ({ unit, note } = match);
  }
  return { ok: true, bits: ratio(amount.n * unit.bits, amount.d), amount, amountText: m[1], unit, typedUnit: Boolean(m[2]), note };
}

export const convert = (bits: Ratio, unit: DataUnit): Ratio => ratio(bits.n, bits.d * unit.bits);

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Decimal text for a fraction. With `decimals`, rounds half up to that many
 * places, but never shows a non-zero amount as 0: tiny values keep three
 * significant digits.
 */
export function formatRatio(r: Ratio, decimals: number | "exact", { grouping = true } = {}): { text: string; exact: boolean } {
  let places = 0;
  if (decimals === "exact") {
    // d is 2^a·5^b, so the expansion ends after max(a, b) places.
    let d = r.d;
    for (const f of [TEN, TWO, FIVE]) {
      while (d % f === ZERO) {
        d /= f;
        places++;
      }
    }
    if (d !== ONE) places = 30;
  } else {
    places = decimals;
    if (r.n !== ZERO && r.n * pow(TEN, places) < r.d) {
      // Below the last shown place: extend to three significant digits.
      let p = places;
      while (r.n * pow(TEN, p) < r.d) p++;
      places = p + 2;
    }
  }
  const scale = pow(TEN, places);
  const scaled = r.n * scale;
  let q = scaled / r.d;
  const rem = scaled % r.d;
  if (rem * TWO >= r.d && rem !== ZERO) q++;
  const exact = rem === ZERO;
  let whole = (q / scale).toString();
  const frac = places ? (q % scale).toString().padStart(places, "0").replace(/0+$/, "") : "";
  if (grouping) whole = group(whole);
  return { text: frac ? `${whole}.${frac}` : whole, exact };
}

/** The largest unit of a system the amount is at least 1 of, e.g. 1.5 GiB rather than 1536 MiB. */
export function bestUnit(bits: Ratio, system: "decimal" | "binary"): DataUnit {
  const units = UNITS.filter((u) => u.system === system).reverse();
  return units.find((u) => bits.n >= u.bits * bits.d) ?? unitById("B")!;
}

/** "1.5 GiB", rounded to `decimals` places, for display. */
export function formatBest(bits: Ratio, system: "decimal" | "binary", decimals = 2): string {
  const unit = bestUnit(bits, system);
  return `${formatRatio(convert(bits, unit), decimals).text} ${unit.id}`;
}

export type SpeedResult = { ok: true; bitsPerSecond: Ratio; unit: DataUnit } | { ok: false; error: string };

/** Reads a transfer speed: "100 Mbps", "12.5 MB/s", "1 Gbit/s", or a bare number in Mbit/s. */
export function parseSpeed(text: string): SpeedResult {
  const size = text
    .trim()
    .replace(/\s*\/\s*s(ec)?$/i, "")
    // MBps is megabytes a second; parseUnit reads any "bps" as bits.
    .replace(/([KMGT]i?)Bps$/, "$1B");
  if (!size) return { ok: false, error: "Enter a speed, like 100 Mbps or 12.5 MB/s." };
  const parsed = parseSize(size, unitById("Mbit")!);
  if (!parsed.ok) return { ok: false, error: parsed.error.replace("Enter a size, like 1.5 GiB or 500 MB.", "Enter a speed, like 100 Mbps or 12.5 MB/s.") };
  if (parsed.bits.n === ZERO) return { ok: false, error: "The speed must be more than 0." };
  return { ok: true, bitsPerSecond: parsed.bits, unit: parsed.unit };
}

/** Seconds to move `bits` at `bitsPerSecond`. */
export const transferSeconds = (bits: Ratio, bitsPerSecond: Ratio): number => Number(bits.n * bitsPerSecond.d) / Number(bits.d * bitsPerSecond.n);

/** "0.08 s", "5.3 s", "5 min 20 s", "2 h 13 min", "3 days 4 h": the two largest parts. */
export function formatTransferTime(seconds: number): string {
  if (seconds === 0) return "0 s";
  if (seconds < 0.01) return "under 0.01 s";
  if (seconds < 10) return `${Number(seconds.toPrecision(2))} s`;
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const parts: [number, string][] = [
    [Math.floor(total / 86400), "days"],
    [Math.floor(total / 3600) % 24, "h"],
    [Math.floor(total / 60) % 60, "min"],
    [total % 60, "s"],
  ];
  const first = parts.findIndex(([n]) => n > 0);
  return parts
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${n.toLocaleString("en-US")} ${unit === "days" && n === 1 ? "day" : unit}`)
    .join(" ");
}
