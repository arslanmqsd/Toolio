import { revisionError } from "../ref-name";
import type { Task } from "../types";
import { messageField, part, refField, remoteField, revisionField, step, when } from "./helpers";

const tagName = () => refField("name", "Tag name", { placeholder: "tag", help: "Like v1.2.0." });
const tagCommit = () => revisionField("commit", "Commit", { optional: true, help: "Leave empty to tag the current commit." });

export const tagTasks: Task[] = [
  {
    id: "create-tag",
    category: "tags",
    title: "Create a tag",
    summary: "Creates a lightweight tag: a name pointing at a commit.",
    synonyms: ["git tag", "tag a commit", "mark a release", "lightweight tag"],
    fields: [tagName(), tagCommit()],
    build: (a) => [
      step("safe", [
        part("git tag", "Create a lightweight tag."),
        part(a.q("name"), "The tag's name."),
        ...when(a.has("commit"), part(a.q("commit"), "The commit to tag.")),
      ]),
    ],
    related: ["create-annotated-tag", "push-tag"],
  },
  {
    id: "create-annotated-tag",
    category: "tags",
    title: "Create an annotated tag",
    summary: "Creates a tag that stores who made it, when, and a message. Preferred for releases.",
    synonyms: ["tag -a", "release tag", "tag with message", "version tag"],
    fields: [tagName(), messageField("message", "Message"), tagCommit()],
    build: (a) => [
      step("safe", [
        part("git tag -a", "Create an annotated tag, which stores its author, date and message."),
        part(a.q("name"), "The tag's name."),
        part(`-m ${a.q("message")}`, "The tag's message."),
        ...when(a.has("commit"), part(a.q("commit"), "The commit to tag.")),
      ]),
    ],
    related: ["push-tag"],
  },
  {
    id: "list-tags",
    category: "tags",
    title: "List tags",
    summary: "Shows tags, optionally only those matching a pattern.",
    synonyms: ["show tags", "tag list", "see versions"],
    fields: [
      {
        id: "pattern",
        label: "Pattern",
        kind: "text",
        default: "",
        optional: true,
        placeholder: "pattern",
        help: "Like v1.*. Leave empty for all tags.",
        validate: revisionError,
      },
    ],
    build: (a) => [
      step("safe", [part("git tag -l", "List tags."), ...when(a.has("pattern"), part(a.q("pattern"), "Only tags matching this pattern."))]),
    ],
  },
  {
    id: "push-tag",
    category: "tags",
    title: "Push a tag",
    summary: "Uploads one tag to the remote.",
    synonyms: ["push tag", "publish tag", "upload tag"],
    fields: [remoteField(), tagName()],
    build: (a) => [step("safe", [part("git push", "Upload to the remote."), part(a.q("remote"), "The remote."), part(a.q("name"), "The tag to push.")])],
  },
  {
    id: "push-all-tags",
    category: "tags",
    title: "Push all tags",
    summary: "Uploads every tag the remote doesn't have yet.",
    synonyms: ["push --tags", "publish tags"],
    fields: [remoteField()],
    build: (a) => [
      step("safe", [part("git push", "Upload to the remote."), part(a.q("remote"), "The remote."), part("--tags", "Push every tag the remote doesn't have yet.")]),
    ],
  },
  {
    id: "delete-tag",
    category: "tags",
    title: "Delete a local tag",
    summary: "Deletes a tag from your machine. The remote is untouched.",
    synonyms: ["tag -d", "remove tag"],
    fields: [tagName()],
    build: (a) => [step("safe", [part("git tag -d", "Delete a tag locally."), part(a.q("name"), "The tag to delete.")])],
    related: ["delete-remote-tag"],
  },
  {
    id: "delete-remote-tag",
    category: "tags",
    title: "Delete a tag on the remote",
    summary: "Removes a tag from the remote repository.",
    synonyms: ["remove remote tag", "push --delete tag", "delete release tag"],
    fields: [remoteField(), tagName()],
    build: (a) => [
      step(
        "caution",
        [
          part("git push", "Send a change to the remote."),
          part(a.q("remote"), "The remote."),
          part("--delete", "Delete a ref there."),
          part(`refs/tags/${a.q("name")}`, "The tag, spelled out in full so a branch with the same name is left alone."),
        ],
        { warning: "Removes the tag from the remote. Anyone who already fetched it keeps their copy." },
      ),
    ],
    related: ["delete-tag"],
  },
];
