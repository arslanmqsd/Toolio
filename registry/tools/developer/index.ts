import type { ToolConfig } from "@/registry/types";
import curlConverter from "./curl-converter";
import jsonFormatter from "./json-formatter";
import jsonToTypes from "./json-to-types";
import jwtDecoder from "./jwt-decoder";

export const developerTools: ToolConfig[] = [jsonFormatter, jwtDecoder, jsonToTypes, curlConverter];
