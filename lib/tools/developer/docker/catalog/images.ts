import type { Task } from "../types";
import { imageError, imagesError, platformError, secretEnvKeys, singleLineError } from "../validate";
import { checkbox, imageField, optionalText, part, step, when } from "./helpers";

const BUILD_ARG = /^[A-Za-z_][A-Za-z0-9_]*(=.*)?$/;

export const imageTasks: Task[] = [
  {
    id: "build",
    category: "images",
    title: "Build an image",
    summary: "Builds an image from a Dockerfile and tags it.",
    synonyms: ["docker build", "build dockerfile", "create image", "build -t", "build with tag"],
    fields: [
      {
        id: "tags",
        label: "Tags",
        kind: "text",
        default: "",
        placeholder: "name:tag",
        help: "Like my-app:1.0. Separate several with spaces, e.g. my-app:1.0 my-app:latest.",
        validate: imagesError,
      },
      { id: "context", label: "Build context", kind: "text", default: ".", placeholder: "context", help: "The folder sent to the builder; COPY paths are relative to it.", validate: singleLineError },
      optionalText("dockerfile", "Dockerfile", { placeholder: "Dockerfile.prod", help: "Leave empty for the context's Dockerfile." }),
      {
        id: "buildArgs",
        label: "Build arguments",
        kind: "lines",
        default: "",
        optional: true,
        sensitive: true,
        placeholder: "NODE_VERSION=22",
        help: "One per line, NAME=value, for ARG lines in the Dockerfile. Not for secrets: they're saved in the image's history.",
        validate: (v) => (BUILD_ARG.test(v) ? null : "Use NAME=value."),
      },
      optionalText("target", "Target stage", { placeholder: "production", help: "Stops at this stage of a multi-stage Dockerfile." }),
      optionalText("platform", "Platform", { placeholder: "linux/amd64", help: "Build for another CPU, e.g. linux/amd64 on an Apple silicon Mac.", validate: platformError }),
      checkbox("noCache", "Don't use the build cache (--no-cache)"),
      checkbox("pull", "Pull newer base images first (--pull)"),
    ],
    build: (a) => {
      const args = a.lines("buildArgs");
      const secrets = secretEnvKeys(args);
      return [
        step(
          "safe",
          [
            part("docker build", "Builds an image from a Dockerfile."),
            ...a.list("tags").map((t) => part(`-t ${t}`, "Names and tags the image.")),
            ...when(a.has("dockerfile"), part(`-f ${a.q("dockerfile")}`, "Uses this Dockerfile instead of the context's.")),
            ...args.map((arg) => part(`--build-arg ${a.quote(arg)}`, `Sets the ${arg.split("=")[0]} ARG.`)),
            ...when(a.has("target"), part(`--target ${a.q("target")}`, "Builds up to this stage.")),
            ...when(a.has("platform"), part(`--platform ${a.q("platform")}`, "Builds for this operating system and CPU.")),
            ...when(a.flag("noCache"), part("--no-cache", "Runs every step again instead of reusing earlier results.")),
            ...when(a.flag("pull"), part("--pull", "Checks for newer versions of the base images.")),
            part(a.q("context"), "The build context."),
          ],
          {
            notes: secrets.length
              ? [`${secrets.join(", ")} ${secrets.length === 1 ? "looks" : "look"} like a secret. Build arguments are saved in the image's history for anyone with the image to read; use RUN --mount=type=secret with --secret instead.`]
              : undefined,
          },
        ),
      ];
    },
    related: ["tag", "push", "run"],
  },
  {
    id: "pull",
    category: "images",
    title: "Pull an image",
    summary: "Downloads an image from a registry without running it.",
    synonyms: ["docker pull", "download image", "update image"],
    fields: [imageField(), optionalText("platform", "Platform", { placeholder: "linux/arm64", validate: platformError })],
    build: (a) => [
      step("safe", [
        part("docker pull", "Downloads an image."),
        ...when(a.has("platform"), part(`--platform ${a.q("platform")}`, "The version for this operating system and CPU.")),
        part(a.q("image"), "The image, from Docker Hub unless it names another registry."),
      ]),
    ],
    related: ["images", "run"],
  },
  {
    id: "push",
    category: "images",
    title: "Push an image",
    summary: "Uploads a tagged image to its registry.",
    synonyms: ["docker push", "upload image", "publish image"],
    fields: [imageField({ help: "Its name says where it goes: ghcr.io/me/app:1.0, or me/app:1.0 for Docker Hub." })],
    build: (a) => [
      step("caution", [part("docker push", "Uploads an image to a registry."), part(a.q("image"), "The image, named for the registry and repository it goes to.")], {
        warning: "Anyone who can read the repository can pull the image, and everything baked into it: files, environment variables and build arguments. Check it holds no secrets.",
      }),
    ],
    related: ["login", "tag"],
  },
  {
    id: "tag",
    category: "images",
    title: "Tag an image",
    summary: "Gives an image another name, e.g. a registry path before pushing.",
    synonyms: ["docker tag", "rename image", "retag image"],
    fields: [imageField({ id: "source", label: "Image", placeholder: "source" }), imageField({ id: "target", label: "New name", placeholder: "target", help: "Like ghcr.io/me/app:1.0." })],
    build: (a) => [
      step("safe", [part("docker tag", "Adds a name to an image; it's the same image, not a copy."), part(a.q("source"), "The image."), part(a.q("target"), "The new name.")]),
    ],
    related: ["push"],
  },
  {
    id: "images",
    category: "images",
    title: "List images",
    summary: "Shows the images on this machine with their tags and sizes.",
    synonyms: ["docker images", "docker image ls", "list images", "show images"],
    fields: [
      checkbox("all", "Include intermediate images (-a)"),
      checkbox("dangling", "Only untagged images (dangling)"),
      optionalText("repo", "Only this name", { placeholder: "nginx", validate: (v) => imageError(v.split(":")[0]) }),
    ],
    build: (a) => [
      step("safe", [
        part("docker images", "Lists images."),
        ...when(a.flag("all"), part("-a", "Includes intermediate build layers.")),
        ...when(a.flag("dangling"), part("--filter dangling=true", "Only images with no tag, usually left over from rebuilds.")),
        ...when(a.has("repo"), part(a.q("repo"), "Only images with this name.")),
      ]),
    ],
    related: ["rmi", "system-df"],
  },
  {
    id: "rmi",
    category: "images",
    title: "Remove an image",
    summary: "Deletes images from this machine. Containers still using them block it.",
    synonyms: ["docker rmi", "docker image rm", "delete image", "remove image"],
    fields: [
      { id: "images", label: "Images", kind: "text", default: "", placeholder: "images", help: "Names or ids, separated by spaces." },
      checkbox("force", "Remove even if containers use it (-f)"),
    ],
    build: (a) => [
      step(
        a.flag("force") ? "destructive" : "caution",
        [
          part("docker rmi", "Deletes images."),
          ...when(a.flag("force"), part("-f", "Removes them even when tagged several times or used by stopped containers.")),
          part(a.list("images").join(" "), "The images to delete."),
        ],
        {
          warning: a.flag("force")
            ? "Images that were only built here, and never pushed, can't be pulled again: you'd have to rebuild them. Containers made from them stop working when restarted."
            : "Images that were only built here, and never pushed, can't be pulled again: you'd have to rebuild them.",
        },
      ),
    ],
    related: ["images", "prune"],
  },
];
