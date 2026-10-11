"use client";

import CommandBuilder from "@/components/tools/command-builder/CommandBuilder";
import { gitCatalog } from "@/lib/tools/developer/git";

export default function GitCommandBuilder() {
  return <CommandBuilder catalog={gitCatalog} outputType="git" />;
}
