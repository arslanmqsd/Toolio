import { describe, expect, it } from "vitest";
import {
  chmodCommand,
  defaultFileMode,
  describeMode,
  formatOctal,
  formatSymbolic,
  getWarnings,
  parseOctal,
  parseSymbolic,
  parseUmask,
  recursiveCommands,
  umaskDefaults,
} from "./chmod";

const octal = (text: string) => {
  const r = parseOctal(text);
  if (!r.ok) throw new Error(r.error);
  return r.mode;
};

describe("octal and symbolic", () => {
  it.each([
    ["644", "rw-r--r--"],
    ["755", "rwxr-xr-x"],
    ["600", "rw-------"],
    ["777", "rwxrwxrwx"],
    ["4755", "rwsr-xr-x"],
    ["2775", "rwxrwsr-x"],
    ["1777", "rwxrwxrwt"],
  ])("%s is %s, both ways", (oct, sym) => {
    const mode = octal(oct);
    expect(formatSymbolic(mode)).toBe(sym);
    expect(formatOctal(mode)).toBe(oct);
    expect(parseSymbolic(sym)).toEqual({ ok: true, mode });
  });

  it("shows special bits in capitals when the execute bit under them is off", () => {
    expect(formatSymbolic(octal("4644"))).toBe("rwSr--r--");
    expect(formatSymbolic(octal("2640"))).toBe("rw-r-S---");
    expect(formatSymbolic(octal("1776"))).toBe("rwxrwxrwT");
    expect(parseSymbolic("rwSr--r--")).toEqual({ ok: true, mode: octal("4644") });
    expect(parseSymbolic("rwxrwxrwT")).toEqual({ ok: true, mode: octal("1776") });
  });

  it("writes 3 digits unless a special bit is set", () => {
    expect(formatOctal(0o7)).toBe("007");
    expect(formatOctal(0o4000)).toBe("4000");
  });

  it("reads 1 to 4 octal digits, as chmod does", () => {
    expect(octal("0755")).toBe(0o755);
    expect(octal(" 7 ")).toBe(0o7);
    expect(octal("44")).toBe(0o44);
  });

  it.each([
    ["", /octal/i],
    ["758", /8.*isn't an octal digit/],
    ["9", /9.*isn't an octal digit/],
    ["07555", /at most 4 digits/],
    ["rwx", /octal/i],
    ["-755", /octal/i],
  ])("rejects %j", (text, message) => {
    const r = parseOctal(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  it("reads the ls -l form, ignoring the file type", () => {
    expect(parseSymbolic("drwxr-xr-x")).toEqual({ ok: true, mode: 0o755 });
    expect(parseSymbolic("-rw-r--r--")).toEqual({ ok: true, mode: 0o644 });
    expect(parseSymbolic("lrwxrwxrwx")).toEqual({ ok: true, mode: 0o777 });
    // ls adds "." or "+" for SELinux contexts and ACLs.
    expect(parseSymbolic("-rw-r--r--.")).toEqual({ ok: true, mode: 0o644 });
    expect(parseSymbolic("-rw-r--r--+")).toEqual({ ok: true, mode: 0o644 });
  });

  it.each([
    ["rwxr-xr-", /9 characters/],
    ["rwxr-xr-xx", /file type/],
    ["rwxr-xr-q", /character 9.*x, t, T or -/i],
    ["wrxr-xr-x", /character 1.*r or -/i],
    ["rwtr-xr-x", /character 3.*x, s, S or -/i],
    ["u+x", /9 characters/],
  ])("rejects %j", (text, message) => {
    const r = parseSymbolic(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });
});

describe("describeMode", () => {
  it("merges classes with the same permissions", () => {
    expect(describeMode(0o755, "file")).toEqual(["Owner can read, write and run it. Group and others can read and run it."]);
    expect(describeMode(0o777, "file")).toEqual(["Everyone can read, write and run it."]);
    expect(describeMode(0o640, "file")).toEqual(["Owner can read and write it. Group can read it. Others can't do anything with it."]);
    expect(describeMode(0o000, "file")).toEqual(["No one can do anything with it, except root."]);
  });

  it("uses what each permission means on a directory", () => {
    expect(describeMode(0o751, "directory")).toEqual([
      "Owner can list, add and remove files, and open it. Group can list and open it. Others can open it, but not list it.",
    ]);
  });

  it("explains special bits", () => {
    expect(describeMode(0o4755, "file")[1]).toMatch(/runs as its owner/i);
    expect(describeMode(0o2775, "directory")[1]).toMatch(/group of the directory/i);
    expect(describeMode(0o1777, "directory")[1]).toMatch(/only.*owner.*delete or rename/i);
  });
});

describe("getWarnings", () => {
  const ids = (mode: number, target: "file" | "directory") => getWarnings(mode, target).map((w) => w.id);

  it("has nothing to say about common modes", () => {
    for (const mode of [0o644, 0o755, 0o600, 0o700, 0o664, 0o775, 0o400]) expect(ids(mode, "file")).toEqual([]);
    for (const mode of [0o755, 0o700, 0o2775, 0o1777]) expect(ids(mode, "directory")).toEqual([]);
  });

  it("warns once about 777", () => {
    expect(ids(0o777, "file")).toEqual(["others-write"]);
    expect(ids(0o777, "directory")).toEqual(["others-write"]);
    expect(ids(0o662, "file")).toEqual(["others-write"]);
  });

  it("explains a world-writable directory without sticky, and is quiet with it", () => {
    expect(getWarnings(0o777, "directory")[0].detail).toMatch(/1777/);
    expect(ids(0o1777, "directory")).toEqual([]);
  });

  it("warns about setuid and setgid programs, more so when others can change them", () => {
    expect(ids(0o4755, "file")).toEqual(["setuid"]);
    expect(ids(0o2755, "file")).toEqual(["setgid"]);
    expect(ids(0o4757, "file")).toEqual(["others-write", "setuid-writable"]);
  });

  it("points out special bits that do nothing", () => {
    expect(ids(0o4644, "file")).toEqual(["setuid-no-exec"]);
    expect(ids(0o1644, "file")).toEqual(["sticky-file"]);
    expect(ids(0o4755, "directory")).toEqual(["setuid-directory"]);
  });

  it("warns about a directory that can be listed but not opened", () => {
    expect(ids(0o744, "directory")).toEqual(["list-no-open"]);
    expect(getWarnings(0o744, "directory")[0].detail).toMatch(/group and others/i);
    expect(ids(0o644, "directory")).toEqual(["list-no-open"]);
    // Open without list is a deliberate pattern, like a home directory others can pass through.
    expect(ids(0o711, "directory")).toEqual([]);
  });
});

describe("chmodCommand", () => {
  it("builds the command, quoting the path for the shell", () => {
    expect(chmodCommand(0o755, "deploy.sh")).toBe("chmod 755 deploy.sh");
    expect(chmodCommand(0o644, "My Notes.txt")).toBe("chmod 644 'My Notes.txt'");
    expect(chmodCommand(0o644, "a;rm -rf ~")).toBe("chmod 644 'a;rm -rf ~'");
    expect(chmodCommand(0o4755, "/usr/local/bin/tool")).toBe("chmod 4755 /usr/local/bin/tool");
  });

  it("keeps a path starting with - from being read as an option", () => {
    expect(chmodCommand(0o644, "-rf")).toBe("chmod 644 ./-rf");
  });
});

describe("recursive commands", () => {
  it("clears execute and special bits for the default file mode", () => {
    expect(defaultFileMode(0o755)).toBe(0o644);
    expect(defaultFileMode(0o2775)).toBe(0o664);
    expect(defaultFileMode(0o700)).toBe(0o600);
  });

  it("gives a find pair, a capital-X form and the plain -R form", () => {
    const r = recursiveCommands(0o755, 0o644, "my site");
    expect(r.find).toBe("find 'my site' -type d -exec chmod 755 {} +\nfind 'my site' -type f -exec chmod 644 {} +");
    expect(r.capitalX).toBe("chmod -R u=rwX,go=rX 'my site'");
    expect(r.plain).toBe("chmod -R 755 'my site'");
  });

  it("only offers the capital-X form when it gives the same result", () => {
    expect(recursiveCommands(0o750, 0o640, "app").capitalX).toBe("chmod -R u=rwX,g=rX,o= app");
    expect(recursiveCommands(0o777, 0o666, "app").capitalX).toBe("chmod -R a=rwX app");
    expect(recursiveCommands(0o755, 0o600, "app").capitalX).toBeNull();
    expect(recursiveCommands(0o2775, 0o664, "app").capitalX).toBeNull();
  });

  it("guards a path starting with - in find too", () => {
    expect(recursiveCommands(0o755, 0o644, "-x").find.split("\n")[0]).toBe("find ./-x -type d -exec chmod 755 {} +");
  });
});

describe("umask", () => {
  const defaults = (text: string) => {
    const r = parseUmask(text);
    if (!r.ok) throw new Error(r.error);
    return umaskDefaults(r.mode);
  };

  it.each([
    ["022", 0o644, 0o755],
    ["0022", 0o644, 0o755],
    ["22", 0o644, 0o755],
    ["077", 0o600, 0o700],
    ["002", 0o664, 0o775],
    ["000", 0o666, 0o777],
  ])("umask %s gives files %o and directories %o", (umask, file, directory) => {
    expect(defaults(umask)).toEqual({ file, directory });
  });

  it("never gives new files execute bits", () => {
    for (let u = 0; u <= 0o777; u++) expect(umaskDefaults(u).file & 0o111).toBe(0);
  });

  it("rejects what isn't a umask", () => {
    expect(parseUmask("088").ok).toBe(false);
    expect(parseUmask("").ok).toBe(false);
    expect(parseUmask("00022").ok).toBe(false);
  });

  it("ignores special bits in a umask", () => {
    expect(defaults("7022")).toEqual({ file: 0o644, directory: 0o755 });
  });
});
