import type { Task } from "../types";
import { envVarNameError, registryError, singleLineError } from "../validate";
import { optionalText, part, step, when } from "./helpers";

const registryField = optionalText("registry", "Registry", { placeholder: "ghcr.io", help: "Leave empty for Docker Hub.", validate: registryError });

export const registryTasks: Task[] = [
  {
    id: "login",
    category: "registry",
    title: "Log in to a registry",
    summary: "Signs in so you can push, or pull private images. The token is piped in, never typed into the command.",
    synonyms: ["docker login", "sign in registry", "authenticate registry", "ghcr login", "docker hub login", "password-stdin"],
    fields: [
      registryField,
      { id: "username", label: "User name", kind: "text", default: "", placeholder: "username", sensitive: true, validate: singleLineError },
      {
        id: "source",
        label: "Read the token from",
        kind: "select",
        default: "env",
        options: [
          { value: "env", label: "An environment variable" },
          { value: "file", label: "A file" },
        ],
      },
      {
        id: "tokenVar",
        label: "Variable name",
        kind: "text",
        default: "REGISTRY_TOKEN",
        placeholder: "VARIABLE",
        help: "Set it first, without it landing in your history: read -rs REGISTRY_TOKEN (PowerShell: $env:REGISTRY_TOKEN = Read-Host -MaskInput).",
        validate: envVarNameError,
        shownWhen: (v) => v.source === "env",
      },
      {
        id: "tokenFile",
        label: "Token file",
        kind: "text",
        default: "",
        placeholder: "token-file",
        help: "A file holding only the token. Keep it out of version control.",
        validate: singleLineError,
        shownWhen: (v) => v.source === "file",
      },
    ],
    build: (a) => {
      const posix = a.shell === "posix";
      const fromFile = a.choice("source") === "file";
      const reader = fromFile
        ? part(posix ? `cat ${a.q("tokenFile")}` : `Get-Content ${a.q("tokenFile")}`, "Reads the token from the file.")
        : part(posix ? `printf '%s' "$${a.text("tokenVar")}"` : `$env:${a.text("tokenVar")}`, "Writes the token from the environment variable, without a trailing newline.");
      return [
        step(
          "safe",
          [
            reader,
            part("|", "Pipes it into the next command, so it never appears on the command line or in history."),
            part("docker login", "Signs in to a registry."),
            part(`--username ${a.q("username")}`, "Your user name there."),
            part("--password-stdin", "Reads the password or token from the pipe."),
            ...when(a.has("registry"), part(a.q("registry"), "The registry's host name.")),
          ],
          {
            notes: [
              "Use an access token with only the scopes you need, not your account password.",
              "Docker saves the login in its credential store, or base64-encoded in ~/.docker/config.json if none is set up; log out on shared machines.",
            ],
          },
        ),
      ];
    },
    related: ["push", "logout"],
  },
  {
    id: "logout",
    category: "registry",
    title: "Log out of a registry",
    summary: "Removes the saved login for a registry from this machine.",
    synonyms: ["docker logout", "sign out registry", "remove credentials"],
    fields: [registryField],
    build: (a) => [step("safe", [part("docker logout", "Deletes the saved login."), ...when(a.has("registry"), part(a.q("registry"), "The registry."))])],
    related: ["login"],
  },
];
