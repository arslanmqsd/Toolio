import { describe, expect, it } from "vitest";
import { formatJson, parseJson } from "./json-format";

const two = { indent: "  ", sortKeys: false };
const fmt = (text: string, options = two) => {
  const result = formatJson(text, options);
  if (!result.ok) throw new Error(result.error.message);
  return result.output;
};

// Deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function randomJson(rand: () => number, depth = 0): unknown {
  const r = rand();
  if (depth > 3 || r < 0.35) {
    const pick = Math.floor(rand() * 6);
    return [null, true, false, Math.round((rand() - 0.5) * 1e6) / 100, "s\"\\/\né🙂" .slice(0, Math.floor(rand() * 7)), -0][pick];
  }
  if (r < 0.65) return Array.from({ length: Math.floor(rand() * 4) }, () => randomJson(rand, depth + 1));
  return Object.fromEntries(Array.from({ length: Math.floor(rand() * 4) }, (_, k) => [`k${k}${"é".repeat(k % 2)}`, randomJson(rand, depth + 1)]));
}

describe("formatJson", () => {
  it("pretty-prints with the chosen indent", () => {
    expect(fmt('{"a":1,"b":[true,null,{}],"c":[]}')).toBe('{\n  "a": 1,\n  "b": [\n    true,\n    null,\n    {}\n  ],\n  "c": []\n}');
    expect(fmt('{"a":[1]}', { indent: "\t", sortKeys: false })).toBe('{\n\t"a": [\n\t\t1\n\t]\n}');
  });

  it("minifies", () => {
    expect(fmt(' {\n "a" : [ 1 , 2 ] ,\n "b" : { } }', { indent: "", sortKeys: false })).toBe('{"a":[1,2],"b":{}}');
  });

  it("sorts keys recursively when asked", () => {
    expect(fmt('{"b":1,"a":{"d":1,"c":2}}', { indent: "", sortKeys: true })).toBe('{"a":{"c":2,"d":1},"b":1}');
  });

  it("keeps numbers and string escapes exactly as written", () => {
    expect(fmt('{"id":9007199254740993,"x":1.50,"e":1E+3,"s":"caf\\u00e9 \\/"}', { indent: "", sortKeys: false })).toBe(
      '{"id":9007199254740993,"x":1.50,"e":1E+3,"s":"caf\\u00e9 \\/"}',
    );
  });

  it("round-trips 2,000 random documents to the same value JSON.parse sees", () => {
    const rand = rng(42);
    for (let n = 0; n < 2000; n++) {
      const source = JSON.stringify(randomJson(rand), null, n % 3);
      for (const options of [two, { indent: "", sortKeys: false }, { indent: "\t", sortKeys: true }]) {
        const out = fmt(source, options);
        const expected = JSON.parse(source);
        expect(JSON.parse(out)).toEqual(expected);
      }
      expect(fmt(source, { indent: "", sortKeys: false })).toBe(JSON.stringify(JSON.parse(source)));
    }
  });
});

describe("validation agrees with JSON.parse", () => {
  it("accepts and rejects exactly the same 5,000 mutated inputs", () => {
    const rand = rng(7);
    const alphabet = ' \t\n{}[]:,"\\\'0123456789.eE+-truefalsnul/*xu';
    let rejected = 0;
    for (let n = 0; n < 5000; n++) {
      let text = JSON.stringify(randomJson(rand), null, n % 2 ? 2 : 0);
      const edits = 1 + Math.floor(rand() * 3);
      for (let e = 0; e < edits; e++) {
        const pos = Math.floor(rand() * (text.length + 1));
        const op = rand();
        const ch = alphabet[Math.floor(rand() * alphabet.length)];
        text = op < 0.4 ? text.slice(0, pos) + text.slice(pos + 1) : op < 0.8 ? text.slice(0, pos) + ch + text.slice(pos) : text.slice(0, pos) + ch + text.slice(pos + 1);
      }
      let native = true;
      try {
        JSON.parse(text);
      } catch {
        native = false;
      }
      const ours = parseJson(text).ok;
      if (ours !== native) throw new Error(`Disagreement (ours=${ours}, JSON.parse=${native}) on: ${JSON.stringify(text)}`);
      if (!native) rejected++;
    }
    // Make sure the mutations actually exercised the error paths.
    expect(rejected).toBeGreaterThan(1500);
  });
});

describe("errors", () => {
  it.each([
    ["", "Input is empty. Paste some JSON.", 1, 1],
    ["{'a': 1}", "Property names must be in double quotes.", 1, 2],
    ["{a: 1}", "Property names must be in double quotes.", 1, 2],
    ['{"a": 1,}', 'Trailing comma before "}"; remove it.', 1, 9],
    ["[1, 2,\n]", 'Trailing comma before "]"; remove it.', 2, 1],
    ['{"a" 1}', 'Expected ":" after property name, but found "1".', 1, 6],
    ['{"a": 1 "b": 2}', 'Expected "," or "}" after a property, but found """.', 1, 9],
    ["[1 2]", 'Expected "," or "]" after an array item, but found "2".', 1, 4],
    ['{"a": \'x\'}', "Strings must use double quotes.", 1, 7],
    ['"line\nbreak"', "Strings can't contain line breaks; use \\n instead.", 1, 6],
    ['"bad \\x"', 'Invalid escape "\\x" in string.', 1, 6],
    ['"\\u12"', "\\u must be followed by four hex digits.", 1, 2],
    ['{"a": "open}', 'This string is never closed; add a closing ".', 1, 7],
    ["[01]", 'Invalid number. JSON numbers can\'t have leading zeros, a trailing ".", or a "+" sign.', 1, 2],
    ["[1.]", 'Invalid number. JSON numbers can\'t have leading zeros, a trailing ".", or a "+" sign.', 1, 2],
    ["[+1]", 'Invalid number. JSON numbers can\'t have leading zeros, a trailing ".", or a "+" sign.', 1, 2],
    ['{"n": NaN}', "NaN isn't valid JSON; use null or a number.", 1, 7],
    ["// hi\n{}", "Comments aren't allowed in JSON.", 1, 1],
    ["{}\n{}", 'Unexpected "{" after the end of the JSON value.', 2, 1],
    ['{"a":', "Expected a value, but the input ended.", 1, 6],
  ])("%j → %s at %i:%i", (text, message, line, column) => {
    const result = parseJson(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ message, line, column });
  });

  it("limits nesting depth instead of overflowing the stack", () => {
    const result = parseJson("[".repeat(600) + "]".repeat(600));
    expect(!result.ok && result.error.message).toBe("Nested more than 500 levels deep.");
  });
});

describe("stats", () => {
  it("counts structure, duplicates, and unsafe integers", () => {
    const result = parseJson('{"a":[1,2.5,"x"],"b":{"c":null,"c":true},"id":12345678901234567890}');
    expect(result.ok && result.stats).toEqual({
      root: "object",
      keys: 5,
      depth: 2,
      counts: { object: 2, array: 1, string: 1, number: 3, boolean: 1, null: 1 },
      unsafeIntegers: 1,
      duplicateKeys: ["c"],
    });
  });
});
