import type { Task } from "../types";
import { cidrError, nameError } from "../validate";
import { checkbox, containerField, optionalText, part, step, when } from "./helpers";

const networkField = (help?: string) => ({ id: "network", label: "Network", kind: "text" as const, default: "", placeholder: "network", help, validate: nameError });

export const networkTasks: Task[] = [
  {
    id: "network-create",
    category: "networks",
    title: "Create a network",
    summary: "Makes a network where containers reach each other by name.",
    synonyms: ["docker network create", "new network", "bridge network"],
    fields: [
      networkField(),
      {
        id: "driver",
        label: "Driver",
        kind: "select",
        default: "bridge",
        options: [
          { value: "bridge", label: "bridge: containers on this machine" },
          { value: "overlay", label: "overlay: across Swarm nodes" },
          { value: "macvlan", label: "macvlan: own address on your LAN" },
        ],
      },
      optionalText("subnet", "Subnet", { placeholder: "172.28.0.0/16", help: "Leave empty to let Docker pick one.", validate: cidrError }),
      checkbox("internal", "No internet access (--internal)"),
    ],
    build: (a) => [
      step("safe", [
        part("docker network create", "Creates a network."),
        ...when(a.choice("driver") !== "bridge", part(`--driver ${a.choice("driver")}`, "The kind of network.")),
        ...when(a.has("subnet"), part(`--subnet ${a.q("subnet")}`, "The address range for its containers.")),
        ...when(a.flag("internal"), part("--internal", "Containers on it can reach each other but not the outside world.")),
        part(a.q("network"), "The network's name."),
      ]),
    ],
    related: ["network-connect", "run"],
  },
  {
    id: "network-connect",
    category: "networks",
    title: "Connect a container to a network",
    summary: "Adds a running container to another network.",
    synonyms: ["docker network connect", "join network", "attach network"],
    fields: [networkField(), containerField(), optionalText("alias", "Extra name on this network", { placeholder: "api", validate: nameError })],
    build: (a) => [
      step("safe", [
        part("docker network connect", "Connects a container to a network."),
        ...when(a.has("alias"), part(`--alias ${a.q("alias")}`, "Other containers on the network can also reach it by this name.")),
        part(a.q("network"), "The network."),
        part(a.q("container"), "The container."),
      ]),
    ],
    related: ["network-disconnect"],
  },
  {
    id: "network-disconnect",
    category: "networks",
    title: "Disconnect a container from a network",
    summary: "Takes a container off a network; it loses its connections there.",
    synonyms: ["docker network disconnect", "leave network", "detach network"],
    fields: [networkField(), containerField(), checkbox("force", "Force (-f)")],
    build: (a) => [
      step(
        "caution",
        [
          part("docker network disconnect", "Disconnects a container from a network."),
          ...when(a.flag("force"), part("-f", "Disconnects even if the container is in a bad state.")),
          part(a.q("network"), "The network."),
          part(a.q("container"), "The container."),
        ],
        { warning: "Open connections over this network drop, and services that reach the container through it stop working until it's connected again." },
      ),
    ],
    related: ["network-connect"],
  },
];
