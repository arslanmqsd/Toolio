import type { Task } from "../types";
import { part, refField, remoteField, step, urlField, when } from "./helpers";

export const remoteTasks: Task[] = [
  {
    id: "add-remote",
    category: "remote",
    title: "Add a remote",
    summary: "Connects your repository to another one, like a new GitHub repo.",
    synonyms: ["connect to github", "add origin", "remote add", "link repository"],
    fields: [refField("name", "Name", { default: "origin", placeholder: "name" }), urlField()],
    build: (a) => [
      step("safe", [
        part("git remote add", "Register a remote under a short name."),
        part(a.q("name"), "The name you'll use for it."),
        part(a.q("url"), "Where the repository lives."),
      ]),
    ],
  },
  {
    id: "change-remote-url",
    category: "remote",
    title: "Change a remote's URL",
    summary: "Points an existing remote at a new address, for example after switching from HTTPS to SSH.",
    synonyms: ["set-url", "change origin url", "switch to ssh", "repository moved"],
    fields: [refField("name", "Remote", { default: "origin", placeholder: "name" }), urlField()],
    build: (a) => [
      step("safe", [
        part("git remote set-url", "Change the URL of an existing remote."),
        part(a.q("name"), "The remote."),
        part(a.q("url"), "Its new URL."),
      ]),
    ],
  },
  {
    id: "list-remotes",
    category: "remote",
    title: "List remotes",
    summary: "Shows each remote and its URLs.",
    synonyms: ["show remotes", "remote -v", "what is origin"],
    fields: [],
    build: () => [step("safe", [part("git remote", "List remotes."), part("-v", "Show their fetch and push URLs.")])],
  },
  {
    id: "push",
    category: "remote",
    title: "Push commits",
    summary: "Uploads the current branch's new commits to the branch it tracks.",
    synonyms: ["upload commits", "git push", "send to github"],
    fields: [],
    build: () => [step("safe", [part("git push", "Upload this branch's new commits to the branch it tracks.")])],
    related: ["push-set-upstream"],
  },
  {
    id: "push-set-upstream",
    category: "remote",
    title: "Push a new branch",
    summary: "Pushes a branch for the first time and makes it track the remote branch.",
    synonyms: ["set upstream", "push -u", "publish branch", "no upstream branch"],
    fields: [remoteField(), refField("branch", "Branch", { placeholder: "branch" })],
    build: (a) => [
      step("safe", [
        part("git push", "Upload commits."),
        part("-u", "Remember the remote branch as upstream, so plain git push and git pull work from now on."),
        part(a.q("remote"), "The remote."),
        part(a.q("branch"), "The branch to push."),
      ]),
    ],
  },
  {
    id: "force-push",
    category: "remote",
    title: "Force push",
    summary: "Overwrites the remote branch with your local one, for example after a rebase or amend.",
    synonyms: ["push --force", "force-with-lease", "overwrite remote branch", "push after rebase"],
    fields: [
      remoteField(),
      refField("branch", "Branch", { placeholder: "branch" }),
      { id: "noLease", label: "Skip the safety check (--force)", kind: "checkbox", default: false },
    ],
    build: (a) => {
      const target = [part(a.q("remote"), "The remote."), part(a.q("branch"), "The branch to overwrite.")];
      return [
        a.flag("noLease")
          ? step("destructive", [part("git push", "Upload commits."), part("--force", "Replace the remote branch with yours, whatever it contains."), ...target], {
              warning:
                "Overwrites the remote branch even if someone else pushed to it, and their commits are lost from it. Untick “Skip the safety check” to use --force-with-lease.",
            })
          : step(
              "caution",
              [
                part("git push", "Upload commits."),
                part("--force-with-lease", "Replace the remote branch with yours, but only if nobody has pushed to it since you last fetched."),
                ...target,
              ],
              { warning: "Replaces the remote branch's history. Anyone who pulled it has to reset to the new version." },
            ),
      ];
    },
  },
  {
    id: "fetch",
    category: "remote",
    title: "Fetch from the remote",
    summary: "Downloads new commits and branches without changing your files.",
    synonyms: ["download changes", "git fetch", "update remote branches", "fetch prune"],
    fields: [
      remoteField({ default: "", optional: true, help: "Leave empty to fetch from every remote." }),
      { id: "prune", label: "Remove branches deleted on the remote", kind: "checkbox", default: false },
    ],
    build: (a) => [
      step("safe", [
        part("git fetch", "Download new commits and branches. Your files and branches don't change."),
        a.has("remote") ? part(a.q("remote"), "The remote to fetch from.") : part("--all", "Fetch from every remote."),
        ...when(a.flag("prune"), part("--prune", "Also remove remote-tracking branches whose branch was deleted on the remote.")),
      ]),
    ],
  },
  {
    id: "pull",
    category: "remote",
    title: "Pull changes",
    summary: "Fetches the upstream branch and brings its new commits into yours.",
    synonyms: ["git pull", "update branch", "get latest changes", "pull rebase"],
    fields: [{ id: "rebase", label: "Rebase instead of merge", kind: "checkbox", default: false }],
    build: (a) => [
      step("safe", [
        part("git pull", "Fetch the upstream branch and integrate its new commits."),
        ...when(a.flag("rebase"), part("--rebase", "Replay your local commits on top of the fetched ones instead of making a merge commit.")),
      ]),
    ],
  },
  {
    id: "set-upstream",
    category: "remote",
    title: "Set a branch's upstream",
    summary: "Makes the current branch track a remote branch, so git pull and git push know where to go.",
    synonyms: ["track remote branch", "set-upstream-to", "there is no tracking information"],
    fields: [remoteField(), refField("branch", "Remote branch", { placeholder: "branch" })],
    build: (a) => [
      step("safe", [
        part("git branch", "Change a branch's settings."),
        part(`--set-upstream-to=${a.q("remote")}/${a.q("branch")}`, "Make the current branch track this remote branch."),
      ]),
    ],
  },
];
