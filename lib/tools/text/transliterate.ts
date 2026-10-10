/**
 * Spells text in plain Latin letters: accents come off (é → e), letters with no decomposition get
 * their usual spelling (ß → ss, ł → l, æ → ae), and Cyrillic and Greek are romanised. Characters
 * with no Latin spelling, like CJK or Arabic, pass through unchanged for the caller to handle.
 */

// Lower case only; upper case is looked up lower-cased and capitalised back.
const SPELLINGS: Record<string, string> = {
  // Latin letters that NFKD doesn't split into a base letter and a mark.
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ð: "d",
  þ: "th",
  ł: "l",
  ı: "i",
  ħ: "h",
  ŧ: "t",
  ŋ: "ng",
  ĸ: "k",
  ſ: "s",
  // Cyrillic: Russian, Ukrainian, Belarusian and Serbian/Macedonian letters.
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  і: "i",
  ї: "yi",
  є: "ye",
  ґ: "g",
  ў: "u",
  ђ: "dj",
  ј: "j",
  љ: "lj",
  њ: "nj",
  ћ: "c",
  џ: "dz",
  ѓ: "gj",
  ќ: "kj",
  ѕ: "dz",
  // Greek; accented vowels decompose to these first.
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o",
};

const MARKS = /\p{M}/gu;

function spell(char: string): string | undefined {
  const lower = char.toLowerCase();
  const spelling = SPELLINGS[lower];
  if (spelling === undefined || lower === char) return spelling;
  return spelling.charAt(0).toUpperCase() + spelling.slice(1);
}

export function transliterate(text: string): string {
  let out = "";
  // Whether the last character had no Latin spelling and was kept as is; its marks stay with it.
  let keptAsIs = false;
  for (const char of text.normalize("NFC")) {
    const direct = spell(char);
    if (direct !== undefined) {
      out += direct;
      keptAsIs = false;
      continue;
    }
    // NFKD also unfolds ligatures (ﬁ → fi) and full-width forms (Ａ → A).
    const base = char.normalize("NFKD").replace(MARKS, "");
    if (!base) {
      // A mark on its own, like a Devanagari vowel sign: part of a word in another script.
      if (keptAsIs) out += char;
      continue;
    }
    const parts = [...base].map((part) => (part <= "\x7f" ? part : spell(part)));
    if (parts.every((part) => part !== undefined)) {
      out += parts.join("");
      keptAsIs = false;
    } else {
      out += char;
      keptAsIs = true;
    }
  }
  return out;
}
