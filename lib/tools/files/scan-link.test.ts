import { describe, expect, it } from "vitest";
import { MAX_PARTS, PART_CHARS, channelName, fromBase64Url, newSession, parseSession, partCollector, seal, sessionLink, toBase64Url, toParts, unseal } from "./scan-link";

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 256);

describe("sessions and links", () => {
  it("makes a fresh, random session each time", () => {
    const [a, b] = [newSession(), newSession()];
    expect(a.id).not.toBe(b.id);
    expect(a.key).not.toBe(b.key);
    expect(fromBase64Url(a.id)).toHaveLength(16);
    expect(fromBase64Url(a.key)).toHaveLength(32);
  });

  it("puts the session in the link's fragment and reads it back", () => {
    const session = newSession();
    const link = sessionLink("https://toolio.app/tools/files/scan-to-pdf#old", session);
    expect(link).toBe(`https://toolio.app/tools/files/scan-to-pdf#scan=${session.id}.${session.key}`);
    expect(parseSession(new URL(link).hash)).toEqual(session);
  });

  it("ignores missing or malformed fragments", () => {
    const { id, key } = newSession();
    for (const hash of ["", "#", "#scan=", `#scan=${id}`, `#scan=${id}.${key}x`, `#scan=${id}.${key.slice(1)}`, `#scan=${id}.${key}&x=1`, `#scan=${id.replace(/./, "!")}.${key}`]) {
      expect(parseSession(hash)).toBeNull();
    }
  });

  it("names the channel after the id only, never the key", () => {
    const session = newSession();
    expect(channelName(session.id)).toBe(`scan-${session.id}`);
    expect(channelName(session.id)).not.toContain(session.key);
  });

  it("round-trips base64url, including bytes that need - and _", () => {
    const data = Uint8Array.from([251, 255, 191, 0, 62, 63]);
    expect(toBase64Url(data)).not.toMatch(/[+/=]/);
    expect(fromBase64Url(toBase64Url(data))).toEqual(data);
  });
});

describe("seal and unseal", () => {
  it("opens with the same key", async () => {
    const { key } = newSession();
    expect(await unseal(key, await seal(key, bytes(1000)))).toEqual(bytes(1000));
  });

  it("scrambles the data and never repeats", async () => {
    const { key } = newSession();
    const [a, b] = [await seal(key, bytes(64)), await seal(key, bytes(64))];
    expect(a).not.toEqual(b);
    expect(Buffer.from(a).includes(Buffer.from(bytes(64)))).toBe(false);
  });

  it("refuses the wrong key", async () => {
    await expect(unseal(newSession().key, await seal(newSession().key, bytes(100)))).rejects.toThrow();
  });

  it("refuses changed bytes", async () => {
    const { key } = newSession();
    const sealed = await seal(key, bytes(100));
    sealed[40] ^= 1;
    await expect(unseal(key, sealed)).rejects.toThrow();
  });

  it("refuses something too short to be sealed", async () => {
    await expect(unseal(newSession().key, bytes(10))).rejects.toThrow("too short");
  });
});

describe("parts", () => {
  it("cuts a big photo into parts under the size limit and joins them in any order", async () => {
    const { key } = newSession();
    const photo = bytes(500_000);
    const parts = await toParts(key, "p1", photo);
    expect(parts.length).toBe(Math.ceil(((500_028 + 2) / 3) * 4 / PART_CHARS));
    expect(parts.every((p) => p.data.length <= PART_CHARS && p.total === parts.length)).toBe(true);
    const collect = partCollector();
    const shuffled = [...parts].reverse();
    const results = shuffled.map((p) => collect.add(p));
    expect(results.slice(0, -1).every((r) => r === null)).toBe(true);
    // Buffer.equals: toEqual walks half a million bytes one by one and takes seconds.
    expect(Buffer.from(await unseal(key, results.at(-1)!)).equals(Buffer.from(photo))).toBe(true);
  });

  it("keeps photos apart when their parts interleave", async () => {
    const { key } = newSession();
    const [a, b] = [await toParts(key, "a", bytes(300_000)), await toParts(key, "b", bytes(200_000))];
    const collect = partCollector();
    const done: Uint8Array[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      for (const part of [a[i], b[i]]) {
        const whole = part && collect.add(part);
        if (whole) done.push(await unseal(key, whole));
      }
    }
    expect(done.map((d) => d.length).sort()).toEqual([200_000, 300_000]);
  });

  it("sends a tiny photo as one part", async () => {
    const parts = await toParts(newSession().key, "x", bytes(10));
    expect(parts).toHaveLength(1);
    expect(partCollector().add(parts[0])).not.toBeNull();
  });

  it("drops parts that don't fit", () => {
    const collect = partCollector();
    const bad = [
      { photo: "p", index: 0, total: 0, data: "AAAA" },
      { photo: "p", index: 2, total: 2, data: "AAAA" },
      { photo: "p", index: -1, total: 2, data: "AAAA" },
      { photo: "p", index: 0.5, total: 2, data: "AAAA" },
      { photo: "p", index: 0, total: MAX_PARTS + 1, data: "AAAA" },
      { photo: "p", index: 0, total: 1, data: "A".repeat(PART_CHARS + 1) },
      { photo: 5, index: 0, total: 1, data: "AAAA" },
      null,
    ];
    for (const part of bad) expect(collect.add(part as never)).toBeNull();
  });

  it("ignores a repeated part and one whose total disagrees", () => {
    const collect = partCollector();
    expect(collect.add({ photo: "p", index: 0, total: 2, data: "AAAA" })).toBeNull();
    expect(collect.add({ photo: "p", index: 0, total: 2, data: "BBBB" })).toBeNull();
    expect(collect.add({ photo: "p", index: 1, total: 3, data: "AAAA" })).toBeNull();
    expect(collect.add({ photo: "p", index: 1, total: 2, data: "AAAA" })).toEqual(new Uint8Array(6));
  });

  it("gives null for parts that aren't base64", () => {
    const collect = partCollector();
    expect(collect.add({ photo: "p", index: 0, total: 1, data: "!!!" })).toBeNull();
  });
});
