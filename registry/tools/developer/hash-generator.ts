import type { ToolConfig } from "@/registry/types";

const hashGenerator: ToolConfig = {
  id: "hash-generator",
  category: "developer",
  title: "Hash Generator",
  description: "Get the MD5, SHA-1, and SHA-256 hash of text or a file.",
  keywords: [
    "hash",
    "md5",
    "sha1",
    "sha-1",
    "sha256",
    "sha-256",
    "checksum",
    "file checksum",
    "verify checksum",
    "verify download",
    "file hash",
    "hash text",
    "digest",
    "fingerprint",
    "sha256sum",
    "md5sum",
  ],
  actions: ["generate", "compare"],
  component: () => import("@/components/tools/developer/HashGenerator"),
  consumes: ["text", "file"],
  produces: ["text", "hash"],
};

export default hashGenerator;
