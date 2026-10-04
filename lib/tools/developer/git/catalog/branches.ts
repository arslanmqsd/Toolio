import type { Task } from "../types";
import { part, pathField, refField, remoteField, revisionField, step, when } from "./helpers";

export const branchTasks: Task[] = [
  {
    id: "create-branch",
    category: "branches",
    title: "Create a new branch",
    summary: "Creates a branch and switches to it.",
    synonyms: ["new branch", "make a branch", "checkout -b", "start a feature branch", "branch off"],
    fields: [
      refField("name", "Branch name", { placeholder: "branch-name" }),
      revisionField("start", "Start from", {
        optional: true,
        placeholder: "start-point",
        help: "A branch, tag or commit. Leave empty to start from the current commit.",
      }),
    ],
    build: (a) => [
      step("safe", [
        part("git switch -c", "Create a branch and switch to it."),
        part(a.q("name"), "The new branch's name."),
        ...when(a.has("start"), part(a.q("start"), "The commit the branch starts from.")),
      ]),
    ],
  },
  {
    id: "switch-branch",
    category: "branches",
    title: "Switch to a branch",
    summary: "Changes your working tree to another existing branch.",
    synonyms: ["checkout branch", "change branch", "go to branch", "git checkout"],
    fields: [refField("name", "Branch", { placeholder: "branch" })],
    build: (a) => [
      step("safe", [part("git switch", "Switch to an existing branch."), part(a.q("name"), "The branch to switch to.")]),
    ],
  },
  {
    id: "checkout-remote-branch",
    category: "branches",
    title: "Check out a branch from the remote",
    summary: "Creates a local branch that tracks a remote one, and switches to it.",
    synonyms: ["checkout remote branch", "track remote branch", "get branch from origin", "work on a colleague's branch"],
    fields: [remoteField(), refField("branch", "Remote branch", { placeholder: "branch" })],
    build: (a) => [
      step("safe", [
        part("git switch --track", "Create a local branch that tracks a remote branch, and switch to it."),
        part(`${a.q("remote")}/${a.q("branch")}`, "The remote branch. The local one gets the same name."),
      ]),
    ],
    related: ["fetch"],
  },
  {
    id: "rename-branch",
    category: "branches",
    title: "Rename a branch",
    summary: "Renames a local branch.",
    synonyms: ["change branch name", "move branch", "branch -m"],
    fields: [
      refField("old", "Current name", {
        optional: true,
        placeholder: "old-name",
        help: "Leave empty to rename the branch you're on.",
      }),
      refField("new", "New name", { placeholder: "new-name" }),
    ],
    build: (a) => [
      step("safe", [
        part("git branch -m", "Rename (move) a branch."),
        ...when(a.has("old"), part(a.q("old"), "The branch to rename.")),
        part(a.q("new"), "Its new name."),
      ]),
    ],
    related: ["rename-branch-remote"],
  },
  {
    id: "rename-branch-remote",
    category: "branches",
    title: "Rename a branch on the remote too",
    summary: "Renames a branch locally, pushes it under the new name and deletes the old name from the remote.",
    synonyms: ["rename remote branch", "rename pushed branch", "change branch name on github"],
    fields: [
      refField("old", "Current name", { placeholder: "old-name" }),
      refField("new", "New name", { placeholder: "new-name" }),
      remoteField(),
    ],
    build: (a) => [
      step("safe", [part("git branch -m", "Rename the local branch."), part(a.q("old"), "Its current name."), part(a.q("new"), "Its new name.")]),
      step("safe", [
        part("git push -u", "Push, and make the local branch track what you push."),
        part(a.q("remote"), "The remote to push to."),
        part(a.q("new"), "The branch, under its new name."),
      ]),
      step(
        "caution",
        [part("git push", "Send a change to the remote."), part(a.q("remote"), "The remote."), part("--delete", "Delete a branch there."), part(a.q("old"), "The old name.")],
        { warning: "Anyone who has the old branch checked out has to switch to the new name." },
      ),
    ],
  },
  {
    id: "delete-branch",
    category: "branches",
    title: "Delete a local branch",
    summary: "Deletes a branch from your machine. The remote is untouched.",
    synonyms: ["remove branch", "branch -d", "branch -D", "force delete branch"],
    fields: [
      refField("name", "Branch", { placeholder: "branch", help: "You can't delete the branch you're on." }),
      { id: "force", label: "Force: delete even if it isn't merged", kind: "checkbox", default: false },
    ],
    build: (a) => [
      a.flag("force")
        ? step(
            "destructive",
            [part("git branch -D", "Delete the branch even if its commits aren't merged anywhere."), part(a.q("name"), "The branch to delete.")],
            { warning: "Commits that are only on this branch stop being reachable. You can get them back from the reflog for a while." },
          )
        : step("safe", [
            part("git branch -d", "Delete the branch. Git refuses if it has commits that aren't merged."),
            part(a.q("name"), "The branch to delete."),
          ]),
    ],
    related: ["delete-remote-branch", "recover-lost-commit"],
  },
  {
    id: "delete-remote-branch",
    category: "branches",
    title: "Delete a branch on the remote",
    summary: "Removes a branch from the remote repository.",
    synonyms: ["remove remote branch", "delete branch on github", "push --delete"],
    fields: [remoteField(), refField("branch", "Branch", { placeholder: "branch" })],
    build: (a) => [
      step(
        "caution",
        [part("git push", "Send a change to the remote."), part(a.q("remote"), "The remote."), part("--delete", "Delete a branch there."), part(a.q("branch"), "The branch to delete.")],
        { warning: "Removes the branch for everyone who uses this remote." },
      ),
    ],
    related: ["delete-branch"],
  },
  {
    id: "list-branches",
    category: "branches",
    title: "List branches",
    summary: "Shows your branches, with the current one marked by *.",
    synonyms: ["show branches", "see all branches", "which branch am i on", "remote branches"],
    fields: [
      {
        id: "scope",
        label: "Which branches",
        kind: "select",
        default: "local",
        options: [
          { value: "local", label: "Local" },
          { value: "remote", label: "Remote-tracking" },
          { value: "all", label: "All" },
        ],
      },
      { id: "verbose", label: "Show last commit and upstream", kind: "checkbox", default: false },
    ],
    build: (a) => [
      step("safe", [
        part("git branch", "List branches."),
        ...when(a.choice("scope") === "remote", part("-r", "Only remote-tracking branches, like origin/main.")),
        ...when(a.choice("scope") === "all", part("-a", "Local and remote-tracking branches.")),
        ...when(a.flag("verbose"), part("-vv", "Show each branch's last commit and the upstream it tracks.")),
      ]),
    ],
  },
  {
    id: "add-worktree",
    category: "branches",
    title: "Work on a branch in a second folder",
    summary: "Checks out a branch in another folder, so you can work on two branches at once without stashing.",
    synonyms: ["worktree", "git worktree add", "two branches at once", "parallel checkout"],
    fields: [
      { ...pathField("path", "Folder"), help: "Usually next to this repository, like ../hotfix." },
      refField("branch", "Branch", { placeholder: "branch" }),
      { id: "create", label: "Create the branch", kind: "checkbox", default: false },
    ],
    build: (a) => [
      step(
        "safe",
        a.flag("create")
          ? [
              part("git worktree add", "Check out a branch in a new folder alongside this one."),
              part("-b", "Create the branch first."),
              part(a.q("branch"), "The new branch's name."),
              part(a.q("path"), "The folder to create."),
            ]
          : [
              part("git worktree add", "Check out a branch in a new folder alongside this one."),
              part(a.q("path"), "The folder to create."),
              part(a.q("branch"), "The existing branch to check out there."),
            ],
      ),
    ],
  },
];
