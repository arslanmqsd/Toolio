import type { ToolConfig } from "@/registry/types";

const jwtDecoder: ToolConfig = {
  id: "jwt-decoder",
  category: "developer",
  title: "JWT Decoder",
  description: "Decode a JSON Web Token's header and payload, and check when it expires.",
  keywords: [
    "jwt",
    "json web token",
    "decode jwt",
    "jwt decoder",
    "decode a jwt",
    "decode token",
    "read token payload",
    "read jwt claims",
    "inspect jwt",
    "parse jwt",
    "check jwt expiry",
    "when does my token expire",
    "is my token expired",
    "jwt exp claim",
    "bearer token",
    "auth token",
    "access token",
    "id token",
  ],
  actions: ["inspect", "extract"],
  component: () => import("@/components/tools/developer/JwtDecoder"),
  consumes: ["jwt"],
  produces: ["json"],
};

export default jwtDecoder;
