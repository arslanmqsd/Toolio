import type { Shell } from "@/lib/command-builder/types";

// Characters with no special meaning to bash or zsh anywhere in a word. "-", "~" and "=" are left out of the first
// position (option, tilde expansion, zsh equals expansion); braces are left out entirely (brace expansion).
const BARE = /^[A-Za-z0-9_./:@%+,][A-Za-z0-9_./:@%+,=~-]*$/;

/** Quotes `arg` for a POSIX shell (bash, zsh) so it reaches the program as one literal argument. */
export function quote(arg: string): string {
  // zsh expands "~" after "=" or ":" inside a word when MAGIC_EQUAL_SUBST is set.
  if (BARE.test(arg) && !/[=:]~/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Safe bare in PowerShell. Left out: "," (makes an array), "@" (splatting), "$" (variables), "`" (escape),
// braces, parentheses, ";", "&", "|", "<", ">", "#", quotes and whitespace. "-" and "." can't start a word:
// a leading "-" can be read as a parameter, and "--%" stops parsing.
const PS_BARE = /^[A-Za-z0-9_/:=+][A-Za-z0-9_./:=+-]*$/;

/**
 * Quotes `arg` for PowerShell so it reaches a native program as one literal argument. Single quotes
 * expand nothing; a ' inside is doubled.
 */
export function quotePowerShell(arg: string): string {
  if (PS_BARE.test(arg)) return arg;
  return `'${arg.replace(/['‘’‚‛]/g, "$&$&")}'`;
}

export const quoteFor = (shell: Shell): ((arg: string) => string) => (shell === "powershell" ? quotePowerShell : quote);

export type SplitResult = { ok: true; words: string[] } | { ok: false; error: string };

/**
 * Splits a command typed as you would in bash, `sh -c 'echo hi'`, into its words: spaces separate,
 * single quotes keep everything, double quotes keep everything but \" and \\, a backslash escapes the
 * next character. Nothing is expanded. The words can then be quoted again for any shell.
 */
export function splitWords(text: string): SplitResult {
  const words: string[] = [];
  let word = "";
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) return { ok: false, error: "A ' quote isn't closed." };
      word += text.slice(i + 1, end);
      i = end;
      inWord = true;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < text.length && text[j] !== '"'; j++) {
        if (text[j] === "\\" && (text[j + 1] === '"' || text[j + 1] === "\\")) j++;
        word += text[j];
      }
      if (j >= text.length) return { ok: false, error: 'A " quote isn\'t closed.' };
      i = j;
      inWord = true;
    } else if (c === "\\" && i + 1 < text.length) {
      word += text[++i];
      inWord = true;
    } else if (/\s/.test(c)) {
      if (inWord) words.push(word);
      word = "";
      inWord = false;
    } else {
      word += c;
      inWord = true;
    }
  }
  if (inWord) words.push(word);
  return { ok: true, words };
}
