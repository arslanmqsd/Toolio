/**
 * Unix file permissions: converting between octal (755) and symbolic (rwxr-xr-x) modes, explaining
 * them, and building chmod commands. A mode is a plain number of at most 12 bits: setuid, setgid
 * and sticky, then read/write/execute for owner, group and others.
 */
import { quote } from "@/lib/shell-quote";

export type Target = "file" | "directory";

export type ModeResult = { ok: true; mode: number } | { ok: false; error: string };

export const SETUID = 0o4000;
export const SETGID = 0o2000;
export const STICKY = 0o1000;

/** Owner, group and others, with the shift that puts their r/w/x bits in the lowest 3. */
export const CLASSES = [
  { id: "owner", label: "Owner", shift: 6 },
  { id: "group", label: "Group", shift: 3 },
  { id: "others", label: "Others", shift: 0 },
] as const;

export const PERMISSIONS = [
  { id: "read", label: "Read", bit: 4, letter: "r" },
  { id: "write", label: "Write", bit: 2, letter: "w" },
  { id: "execute", label: "Execute", bit: 1, letter: "x" },
] as const;

/** The 3 permission bits (0–7) of a class. */
const bitsOf = (mode: number, shift: number) => (mode >> shift) & 7;

/** 3 digits, or 4 when a special bit is set: "755", "4755". */
export function formatOctal(mode: number): string {
  return mode.toString(8).padStart(mode > 0o777 ? 4 : 3, "0");
}

function parseDigits(text: string, what: string, example: string): ModeResult {
  const value = text.trim();
  if (/^\d+$/.test(value)) {
    const bad = value.match(/[89]/);
    if (bad) return { ok: false, error: `"${bad[0]}" isn't an octal digit; each digit is 0 to 7.` };
    if (value.length > 4) return { ok: false, error: `${what} has at most 4 digits, like ${example}.` };
    return { ok: true, mode: parseInt(value, 8) };
  }
  return { ok: false, error: `${what} is 1 to 4 octal digits (0 to 7), like ${example}.` };
}

/** 1 to 4 octal digits, as chmod reads them: "7" is 007, "0755" is 755. */
export function parseOctal(text: string): ModeResult {
  return parseDigits(text, "An octal mode", "755");
}

const SPECIAL_SLOTS = [
  { bit: SETUID, shift: 6, set: "s" },
  { bit: SETGID, shift: 3, set: "s" },
  { bit: STICKY, shift: 0, set: "t" },
] as const;

/**
 * The 9-character form. A special bit takes its class's execute slot: lowercase (s, t) when
 * execute is also set, uppercase (S, T) when it isn't.
 */
export function formatSymbolic(mode: number): string {
  return CLASSES.map(({ shift }, i) => {
    const bits = bitsOf(mode, shift);
    const special = SPECIAL_SLOTS[i];
    const x = mode & special.bit ? (bits & 1 ? special.set : special.set.toUpperCase()) : bits & 1 ? "x" : "-";
    return (bits & 4 ? "r" : "-") + (bits & 2 ? "w" : "-") + x;
  }).join("");
}

/** The first character of ls -l: regular file, directory, symlink, block and character device, pipe, socket, door. */
const FILE_TYPES = "-dlbcpsD";

/** The 9-character form, or ls -l's 10 (or 11, with ls's "." or "+" for SELinux and ACLs). */
export function parseSymbolic(text: string): ModeResult {
  let value = text.trim();
  let offset = 0;
  if (value.length === 11 && /[.+@]$/.test(value)) value = value.slice(0, -1);
  if (value.length === 10) {
    if (!FILE_TYPES.includes(value[0])) {
      return { ok: false, error: `With 10 characters the first is the file type, like - or d, not "${value[0]}".` };
    }
    value = value.slice(1);
    offset = 1;
  }
  if (value.length !== 9) {
    const expression = /^[ugoa]*[+=-]/.test(value) ? "Changes like u+x aren't supported. " : "";
    return { ok: false, error: `${expression}A symbolic mode is 9 characters, like rwxr-xr-x, or ls -l's 10, like drwxr-xr-x.` };
  }

  let mode = 0;
  for (let i = 0; i < 9; i++) {
    const char = value[i];
    const shift = 6 - 3 * Math.floor(i / 3);
    const slot = i % 3;
    const special = SPECIAL_SLOTS[Math.floor(i / 3)];
    const allowed = slot === 0 ? "r-" : slot === 1 ? "w-" : `x${special.set}${special.set.toUpperCase()}-`;
    if (!allowed.includes(char)) {
      const options = allowed.split("");
      const list = `${options.slice(0, -1).join(", ")} or ${options[options.length - 1]}`;
      return { ok: false, error: `Character ${i + 1 + offset} should be ${list}, not "${char}".` };
    }
    if (char === "-") continue;
    if (slot < 2) mode |= (slot === 0 ? 4 : 2) << shift;
    else {
      if (char !== char.toUpperCase() || char === "x") mode |= 1 << shift;
      if (char !== "x") mode |= special.bit;
    }
  }
  return { ok: true, mode };
}

/** "a, b and c"; "a, b, and c" when an item has its own "and". */
function joinWords(words: string[]): string {
  if (words.length < 2) return words.join("");
  const last = words[words.length - 1];
  const comma = words.some((w) => w.includes(" and ")) ? "," : "";
  return `${words.slice(0, -1).join(", ")}${comma} and ${last}`;
}

/** What a class can do: "read and run it", "list and open it". */
function abilities(bits: number, target: Target): string {
  if (bits === 0) return "can't do anything with it";
  if (target === "file") {
    return `can ${joinWords([bits & 4 && "read", bits & 2 && "write", bits & 1 && "run"].filter((w): w is string => !!w))} it`;
  }
  const words = [bits & 4 && "list", bits & 2 && "add and remove files", bits & 1 && "open"].filter((w): w is string => !!w);
  const object = bits & 1 ? "it" : "in it";
  return `can ${joinWords(words)} ${object}${bits & 1 && !(bits & 4) ? ", but not list it" : ""}`;
}

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

/**
 * Who can do what, in plain English, as sentences. The first covers the 9 permission bits, merging
 * classes with the same ones; any after it explain special bits.
 */
export function describeMode(mode: number, target: Target): string[] {
  const [owner, group, others] = CLASSES.map(({ shift }) => bitsOf(mode, shift));
  let permissions: string;
  if (owner === 0 && group === 0 && others === 0) permissions = "No one can do anything with it, except root.";
  else if (owner === group && group === others) permissions = `Everyone ${abilities(owner, target)}.`;
  else {
    const parts: [string, number][] =
      group === others ? [["Owner", owner], ["Group and others", group]] : owner === group ? [["Owner and group", owner], ["Others", others]] : [["Owner", owner], ["Group", group], ["Others", others]];
    permissions = parts.map(([who, bits]) => `${who} ${abilities(bits, target)}.`).join(" ");
  }

  const sentences = [permissions];
  if (target === "file") {
    if (mode & SETUID) sentences.push("Setuid: it runs as its owner, whoever starts it.");
    if (mode & SETGID) sentences.push("Setgid: it runs with its group's permissions, whoever starts it.");
    if (mode & STICKY) sentences.push("Sticky: has no effect on files on Linux or macOS.");
  } else {
    if (mode & SETUID) sentences.push("Setuid: has no effect on directories on Linux.");
    if (mode & SETGID) sentences.push("Setgid: new files and folders inside get the group of the directory, not that of whoever creates them.");
    if (mode & STICKY) sentences.push("Sticky: only a file's owner, the directory's owner or root can delete or rename files inside.");
  }
  return sentences;
}

export interface ModeWarning {
  id: string;
  title: string;
  detail: string;
}

/** Risky or pointless combinations, each with what it means and what to use instead. */
export function getWarnings(mode: number, target: Target): ModeWarning[] {
  const warnings: ModeWarning[] = [];
  const [owner, group, others] = CLASSES.map(({ shift }) => bitsOf(mode, shift));
  const safer = formatOctal(mode & ~0o002);

  if (others & 2) {
    if (target === "file") {
      warnings.push({
        id: "others-write",
        title: "Anyone can change it",
        detail: `Every user on the system can change or empty this file, and if it's a script, make it run their own code. Use ${safer} to take write away from others.`,
      });
    } else if (!(mode & STICKY)) {
      warnings.push({
        id: "others-write",
        title: "Anyone can delete files in it",
        detail: `Every user on the system can add files here and delete or rename anyone's, not only their own. Use ${safer}, or for a shared directory like /tmp, ${formatOctal((mode | STICKY) & ~0o6000)} so people can only delete their own files.`,
      });
    }
  }

  if (target === "file") {
    const writable = (group & 2) | (others & 2);
    for (const [bit, x, name, as] of [
      [SETUID, owner & 1, "setuid", "its owner"],
      [SETGID, group & 1, "setgid", "its group"],
    ] as const) {
      if (!(mode & bit)) continue;
      if (!x) {
        warnings.push({
          id: `${name}-no-exec`,
          title: `${capitalize(name)} has no effect`,
          detail: `${capitalize(name)} only matters for a program ${name === "setuid" ? "the owner" : "the group"} can run, so here it does nothing (ls shows it as a capital S). Add execute or drop ${name}.`,
        });
      } else if (writable) {
        warnings.push({
          id: `${name}-writable`,
          title: `Others can replace a program that runs as ${as}`,
          detail: `It runs with ${as}'s permissions, and users other than the owner can change it, so they can make it run any code with those permissions. Never make a ${name} program writable by group or others.`,
        });
      } else {
        warnings.push({
          id: name,
          title: `Runs as ${as}`,
          detail: `Whoever runs it gets ${as}'s permissions, so a bug in it can give them those powers${name === "setuid" ? ", root's if root owns it" : ""}. Only set ${name} on programs built for it, like passwd.`,
        });
      }
    }
    if (mode & STICKY) {
      warnings.push({ id: "sticky-file", title: "Sticky has no effect on files", detail: "Linux and macOS ignore the sticky bit on files. It matters on directories, where only owners can delete their files." });
    }
  } else {
    if (mode & SETUID) {
      warnings.push({ id: "setuid-directory", title: "Setuid has no effect on directories", detail: "Linux ignores setuid on directories. Did you mean setgid, which makes new files inside share the directory's group?" });
    }
    const blind = CLASSES.filter(({ shift }) => (bitsOf(mode, shift) & 5) === 4).map(({ id }) => id as string);
    if (blind.length > 0) {
      const who = blind.length === 3 ? "Everyone" : capitalize(joinWords(blind));
      warnings.push({
        id: "list-no-open",
        title: "Can list it but not open it",
        detail: `${who} can see the names of files inside, but not open it, read those files or even see their sizes. Add execute (r-x) so they can open it, or take read away too.`,
      });
    }
  }
  return warnings;
}

/** Quoted for the shell. A path starting with - would be read as an option, so it gets ./ in front. */
function shellPath(path: string): string {
  return quote(path.startsWith("-") ? `./${path}` : path);
}

export function chmodCommand(mode: number, path: string): string {
  return `chmod ${formatOctal(mode)} ${shellPath(path)}`;
}

/** The usual mode for files under a directory: the directory's, without execute or special bits. */
export function defaultFileMode(directoryMode: number): number {
  return directoryMode & 0o666;
}

export interface RecursiveCommands {
  /** Directories and files set separately, with find. */
  find: string;
  /** One chmod -R where X sets execute on directories only (and on files already executable). Null when it can't express the two modes. */
  capitalX: string | null;
  /** chmod -R with one mode, which gives files the directory mode too. */
  plain: string;
}

export function recursiveCommands(directoryMode: number, fileMode: number, path: string): RecursiveCommands {
  const target = shellPath(path);
  const find = [`find ${target} -type d -exec chmod ${formatOctal(directoryMode)} {} +`, `find ${target} -type f -exec chmod ${formatOctal(fileMode)} {} +`].join("\n");
  let capitalX: string | null = null;
  if (directoryMode <= 0o777 && fileMode === defaultFileMode(directoryMode)) {
    const [u, g, o] = CLASSES.map(({ shift }) => {
      const bits = bitsOf(directoryMode, shift);
      return (bits & 4 ? "r" : "") + (bits & 2 ? "w" : "") + (bits & 1 ? "X" : "");
    });
    const clauses = u === g && g === o ? [`a=${u}`] : g === o ? [`u=${u}`, `go=${g}`] : u === g ? [`ug=${u}`, `o=${o}`] : [`u=${u}`, `g=${g}`, `o=${o}`];
    capitalX = `chmod -R ${clauses.join(",")} ${target}`;
  }
  return { find, capitalX, plain: `chmod -R ${formatOctal(directoryMode)} ${target}` };
}

/** A umask is read like an octal mode; any special bits in it don't apply to new files. */
export function parseUmask(text: string): ModeResult {
  const result = parseDigits(text, "A umask", "022");
  return result.ok ? { ok: true, mode: result.mode & 0o777 } : result;
}

/** Modes new files and directories get. Programs create files with 666 at most, so a umask never gives them execute. */
export function umaskDefaults(umask: number): { file: number; directory: number } {
  return { file: 0o666 & ~umask, directory: 0o777 & ~umask };
}
