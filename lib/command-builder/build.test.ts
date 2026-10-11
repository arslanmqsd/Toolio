import { describe, expect, it } from "vitest";
import { commandText, presetValues, resolveTask, stepCommand } from "./build";
import type { Step, Task } from "./types";

const task: Task = {
  id: "t",
  category: "c",
  title: "T",
  summary: "S",
  synonyms: [],
  fields: [
    { id: "name", label: "Name", kind: "text", default: "" },
    { id: "ports", label: "Ports", kind: "lines", default: "", optional: true, validate: (v) => (/^\d+$/.test(v) ? null : "Not a number.") },
  ],
  presets: [{ id: "web", label: "Web", values: { name: "web server", ports: "80\n443" } }],
  build: (a) => [{ danger: "safe", parts: [{ text: "run", explain: "." }, { text: a.q("name"), explain: "." }, ...a.lines("ports").map((p) => ({ text: `-p ${a.quote(p)}`, explain: "." }))] }],
};

describe("resolveTask", () => {
  it("quotes for the chosen shell", () => {
    const values = { name: "it's", ports: "" };
    expect(commandText((resolveTask(task, values) as { steps: Step[] }).steps)).toBe("run 'it'\\''s'");
    expect(commandText((resolveTask(task, values, "powershell") as { steps: Step[] }).steps)).toBe("run 'it''s'");
  });

  it("reads lines fields, skipping blanks, and names the bad line", () => {
    const ok = resolveTask(task, { name: "x", ports: " 80 \n\n443\n" });
    expect(ok.status === "ready" && commandText(ok.steps)).toBe("run x -p 80 -p 443");
    expect(resolveTask(task, { name: "x", ports: "80\n\nabc" })).toEqual({ status: "invalid", errors: { ports: "Line 3: Not a number." } });
    expect(resolveTask(task, { name: "x", ports: "abc" })).toEqual({ status: "invalid", errors: { ports: "Not a number." } });
  });
});

describe("presetValues", () => {
  it("puts a preset over the defaults", () => {
    expect(presetValues(task, "web")).toEqual({ name: "web server", ports: "80\n443" });
    expect(presetValues(task, "missing")).toEqual({ name: "", ports: "" });
  });
});

describe("stepCommand", () => {
  const long: Step = {
    danger: "safe",
    parts: ["docker run", "-d", "--name web-server-production", "-p 8080:80", "-v ./site:/usr/share/nginx/html:ro", "nginx:1.27-alpine", "nginx"].map((text) => ({ text, explain: "." })),
  };

  it("keeps short commands, and multiline off, on one line", () => {
    expect(stepCommand({ danger: "safe", parts: [{ text: "docker ps", explain: "." }, { text: "-a", explain: "." }] }, { multiline: true })).toBe("docker ps -a");
    expect(stepCommand(long)).not.toContain("\n");
  });

  it("splits before each option and the first argument after them", () => {
    expect(stepCommand(long, { multiline: true })).toBe(
      "docker run \\\n  -d \\\n  --name web-server-production \\\n  -p 8080:80 \\\n  -v ./site:/usr/share/nginx/html:ro \\\n  nginx:1.27-alpine nginx",
    );
  });

  it("uses PowerShell's backtick to continue lines", () => {
    expect(stepCommand(long, { multiline: true, shell: "powershell" }).split("\n")[0]).toBe("docker run `");
  });
});
