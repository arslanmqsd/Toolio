"use client";

import CommandBuilder from "@/components/tools/command-builder/CommandBuilder";
import { dockerCatalog } from "@/lib/tools/developer/docker";

export default function DockerCommandBuilder() {
  return <CommandBuilder catalog={dockerCatalog} outputType="docker" shells historyKey="docker-command-history" />;
}
