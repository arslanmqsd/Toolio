/**
 * Realistic fake people for mock APIs and test databases, as JSON or CSV. A seeded PRNG makes the
 * same seed always give the same rows. Emails use domains reserved for examples and phone numbers
 * the 555-01xx range set aside for fiction, so none reach a real person.
 */
import { writeCsv } from "@/lib/csv/write";
import { plural, type Notice } from "@/lib/notices";
import { between, createRng, pick, type Rng } from "@/lib/random/seeded";
import { PREVIEW_ROWS, type TablePreview } from "./json-csv";
import { CITIES, COMPANY_SUFFIXES, COMPANY_WORDS, EMAIL_DOMAINS, FIRST_NAMES, JOB_TITLES, LAST_NAMES, STREET_NAMES, STREET_TYPES } from "./fake-data-lists";

export const FAKE_FIELDS = [
  { id: "id", label: "ID (UUID)" },
  { id: "firstName", label: "First name" },
  { id: "lastName", label: "Last name" },
  { id: "fullName", label: "Full name" },
  { id: "email", label: "Email" },
  { id: "username", label: "Username" },
  { id: "phone", label: "Phone" },
  { id: "birthDate", label: "Date of birth" },
  { id: "street", label: "Street address" },
  { id: "city", label: "City" },
  { id: "state", label: "State" },
  { id: "zip", label: "ZIP code" },
  { id: "country", label: "Country" },
  { id: "company", label: "Company" },
  { id: "jobTitle", label: "Job title" },
  { id: "createdAt", label: "Created at" },
  { id: "isActive", label: "Active" },
] as const;

export type FakeFieldId = (typeof FAKE_FIELDS)[number]["id"];
export type FakeFormat = "json" | "csv";
export type KeyStyle = "camel" | "snake";

export interface FakeDataOptions {
  count: number;
  fields: FakeFieldId[];
  format: FakeFormat;
  keyStyle: KeyStyle;
  /** A 32-bit unsigned integer. */
  seed: number;
}

export const MAX_FAKE_ROWS = 1000;

/** A fixed first seed, so the page renders the same data on the server and in the browser. */
export const DEFAULT_FAKE_DATA: FakeDataOptions = {
  count: 10,
  fields: ["id", "firstName", "lastName", "email", "phone", "city", "state", "createdAt"],
  format: "json",
  keyStyle: "camel",
  seed: 1,
};

export type FakeDataResult = { ok: true; value: string; table: TablePreview; notices: Notice[]; seed: number } | { ok: false; error: string };

type Person = Record<FakeFieldId, string | boolean>;

const DAY = 86_400_000;
const BIRTH_RANGE = [Date.UTC(1950, 0, 1), Date.UTC(2006, 11, 31)] as const;
// Fixed, so the same seed gives the same dates whenever it's run.
const CREATED_RANGE = [Date.UTC(2022, 0, 1), Date.UTC(2025, 11, 31, 23, 59, 59)] as const;

/** Letters only, without accents: "Zoë" → "zoe". */
const ascii = (name: string) => name.normalize("NFD").replace(/[^a-z]/gi, "").toLowerCase();

/** A version 4 UUID from the seeded PRNG, so it's reproducible. Fine for test data, not for real ids. */
function uuid(rng: Rng): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(rng() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Adds 2, 3… to a name already taken, so the column can be a unique key. */
function unique(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}${n}`;
  taken.add(name);
  return name;
}

/** Every field for one person, in a fixed order, so choosing fields never changes the others' values. */
function person(rng: Rng, emails: Set<string>, usernames: Set<string>): Person {
  const id = uuid(rng);
  const firstName = pick(rng, FIRST_NAMES);
  const lastName = pick(rng, LAST_NAMES);
  const first = ascii(firstName);
  const last = ascii(lastName);
  const localPart = pick(rng, [`${first}.${last}`, `${first}${last}`, `${first[0]}.${last}`, `${first}_${last}`, `${first}${between(rng, 1, 99)}`]);
  const domain = pick(rng, EMAIL_DOMAINS);
  const emailBase = unique(localPart, emails);
  const username = unique(pick(rng, [`${first}${last[0]}`, `${first}.${last}`, `${first[0]}${last}`, `${first}${between(rng, 10, 999)}`]), usernames);
  const birthDate = new Date(BIRTH_RANGE[0] + between(rng, 0, (BIRTH_RANGE[1] - BIRTH_RANGE[0]) / DAY) * DAY).toISOString().slice(0, 10);
  const street = `${between(rng, 1, 9999)} ${pick(rng, STREET_NAMES)} ${pick(rng, STREET_TYPES)}`;
  const [city, state, zipPrefix, areaCode] = pick(rng, CITIES);
  // 555-0100 to 555-0199 are set aside for fiction in every area code.
  const phone = `(${areaCode}) 555-01${String(between(rng, 0, 99)).padStart(2, "0")}`;
  const zip = `${zipPrefix}${String(between(rng, 1, 99)).padStart(2, "0")}`;
  const company = `${pick(rng, COMPANY_WORDS)} ${pick(rng, COMPANY_SUFFIXES)}`;
  const jobTitle = pick(rng, JOB_TITLES);
  const createdAt = new Date(CREATED_RANGE[0] + between(rng, 0, (CREATED_RANGE[1] - CREATED_RANGE[0]) / 1000) * 1000).toISOString().replace(".000Z", "Z");
  const isActive = rng() < 0.8;
  return {
    id,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: `${emailBase}@${domain}`,
    username,
    phone,
    birthDate,
    street,
    city,
    state,
    zip,
    country: "United States",
    company,
    jobTitle,
    createdAt,
    isActive,
  };
}

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function clampCount(requested: number, notices: Notice[]): number {
  const count = Number.isFinite(requested) ? Math.trunc(requested) : 1;
  if (count > MAX_FAKE_ROWS) {
    notices.push({ kind: "warning", message: `It makes up to ${plural(MAX_FAKE_ROWS, "row", "rows")} at a time, so this is ${MAX_FAKE_ROWS.toLocaleString("en-US")}.` });
    return MAX_FAKE_ROWS;
  }
  if (count < 1) {
    notices.push({ kind: "warning", message: "It makes at least 1 row, so this is 1." });
    return 1;
  }
  return count;
}

export function generateFakeData(options: FakeDataOptions): FakeDataResult {
  const fields = FAKE_FIELDS.map((f) => f.id).filter((id) => options.fields.includes(id));
  if (fields.length === 0) return { ok: false, error: "Choose at least one field." };
  const notices: Notice[] = [];
  const count = clampCount(options.count, notices);

  const rng = createRng(options.seed);
  const emails = new Set<string>();
  const usernames = new Set<string>();
  const people = Array.from({ length: count }, () => person(rng, emails, usernames));

  const keys = fields.map((f) => (options.keyStyle === "snake" ? snake(f) : f));
  const cells = people.map((p) => fields.map((f) => String(p[f])));
  const value =
    options.format === "json"
      ? JSON.stringify(
          people.map((p) => Object.fromEntries(fields.map((f, i) => [keys[i], p[f]]))),
          null,
          2,
        )
      : writeCsv([keys, ...cells], ",", false);

  return {
    ok: true,
    value,
    table: { header: keys, rows: cells.slice(0, PREVIEW_ROWS), rowCount: count, columnCount: keys.length },
    notices,
    seed: options.seed,
  };
}
