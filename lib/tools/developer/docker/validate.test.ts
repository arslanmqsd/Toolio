import { describe, expect, it } from "vitest";
import { cpusError, durationError, envLineError, imageError, memoryError, nameError, registryError, secretEnvKeys, sinceError, userError } from "./validate";

describe("docker validators", () => {
  it.each(["nginx", "nginx:1.27-alpine", "me/app:1.0", "ghcr.io/me/app:1.0", "localhost:5000/app", "app@sha256:" + "a".repeat(64)])("accepts image %s", (image) => {
    expect(imageError(image)).toBeNull();
  });

  it.each(["", "My-App", "app:", "app name", "-app", "app:-bad"])("rejects image %j", (image) => {
    expect(imageError(image)).not.toBeNull();
  });

  it("checks names, env lines, limits, users and times", () => {
    expect(nameError("web_1.a-b")).toBeNull();
    expect(nameError("-web")).not.toBeNull();
    expect(envLineError("A_B=1=2")).toBeNull();
    expect(envLineError("PASS_THROUGH")).toBeNull();
    expect(envLineError("1A=x")).not.toBeNull();
    expect(memoryError("512m")).toBeNull();
    expect(memoryError("1.5G")).toBeNull();
    expect(memoryError("512 MB")).not.toBeNull();
    expect(cpusError("0.5")).toBeNull();
    expect(cpusError("0")).not.toBeNull();
    expect(userError("1000:1000")).toBeNull();
    expect(userError("node")).toBeNull();
    expect(userError("root user")).not.toBeNull();
    expect(durationError("1h30m")).toBeNull();
    expect(durationError("30")).not.toBeNull();
    expect(sinceError("2024-06-01")).toBeNull();
    expect(sinceError("yesterday")).not.toBeNull();
    expect(registryError("registry.example.com:5000")).toBeNull();
    expect(registryError("https://ghcr.io")).not.toBeNull();
  });

  it("finds secret-looking variables given a value", () => {
    expect(secretEnvKeys(["NODE_ENV=production", "DB_PASSWORD=x", "API_TOKEN", "DATABASE_URL=postgres://u:p@db/app"])).toEqual(["DB_PASSWORD", "DATABASE_URL"]);
  });
});
