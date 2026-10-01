import type { ToolConfig } from "@/registry/types";
import cronBuilder from "./cron-builder";
import curlConverter from "./curl-converter";
import envGenerator from "./env-generator";
import hashGenerator from "./hash-generator";
import httpStatus from "./http-status";
import jsonFormatter from "./json-formatter";
import jsonToTypes from "./json-to-types";
import jwtDecoder from "./jwt-decoder";
import regexTester from "./regex-tester";
import unixTimestamp from "./unix-timestamp";
import urlEncoder from "./url-encoder";
import uuidGenerator from "./uuid-generator";

export const developerTools: ToolConfig[] = [jsonFormatter, jwtDecoder, regexTester, jsonToTypes, curlConverter, urlEncoder, unixTimestamp, uuidGenerator, hashGenerator, httpStatus, envGenerator, cronBuilder];
