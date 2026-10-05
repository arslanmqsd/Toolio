import type { ToolConfig } from "@/registry/types";

const base64Converter: ToolConfig = {
  id: "base64-converter",
  category: "developer",
  title: "Base64 Encoder and Decoder",
  description: "Encode text or files to Base64 or Base64URL, and decode Base64 back to text, images or files.",
  keywords: [
    "base64 encode",
    "base64 decode",
    "base64 encoder",
    "base64 decoder",
    "base64 to text",
    "text to base64",
    "base64url",
    "url safe base64",
    "file to base64",
    "image to base64",
    "base64 to image",
    "base64 to file",
    "data url",
    "decode basic auth header",
  ],
  actions: ["convert", "inspect"],
  component: () => import("@/components/tools/developer/Base64Converter"),
  consumes: ["text", "base64", "file"],
  produces: ["text", "base64", "file"],
};

export default base64Converter;
