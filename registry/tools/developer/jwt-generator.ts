import type { ToolConfig } from "@/registry/types";

const jwtGenerator: ToolConfig = {
  id: "jwt-generator",
  category: "developer",
  title: "JWT Generator",
  description: "Create signed JWTs in your browser with HS256, RS256, ES256 or EdDSA. Set claims and expiry, and generate key pairs.",
  keywords: [
    "create jwt",
    "generate jwt",
    "jwt generator",
    "make a jwt",
    "sign jwt",
    "jwt signer",
    "encode jwt",
    "jwt encoder",
    "create token",
    "generate test token",
    "sign token",
    "hs256",
    "rs256",
    "es256",
    "eddsa",
    "jwt secret",
    "jwt claims",
    "jwt expiry",
    "jwt key pair",
    "generate rsa key pair",
  ],
  actions: ["generate"],
  component: () => import("@/components/tools/developer/JwtGenerator"),
  consumes: ["json"],
  produces: ["jwt"],
};

export default jwtGenerator;
