import { describe, expect, it } from "vitest";
import { parsePort, parseVolume } from "./parse";

const port = (text: string) => {
  const r = parsePort(text);
  return r.ok ? r.value : r.error;
};
const volume = (text: string) => {
  const r = parseVolume(text);
  return r.ok ? r.value : r.error;
};

describe("parsePort", () => {
  it("reads container-only, host:container, IP-bound and ranged ports", () => {
    expect(port("80")).toEqual({ hostIp: "", host: null, container: { start: 80, end: 80 }, protocol: "tcp" });
    expect(port("8080:80")).toMatchObject({ host: { start: 8080, end: 8080 }, container: { start: 80, end: 80 } });
    expect(port("127.0.0.1:5432:5432")).toMatchObject({ hostIp: "127.0.0.1", host: { start: 5432, end: 5432 } });
    expect(port("127.0.0.1::5000")).toMatchObject({ hostIp: "127.0.0.1", host: null });
    expect(port("[::1]:8080:80")).toMatchObject({ hostIp: "::1", host: { start: 8080, end: 8080 } });
    expect(port("8000-8010:8000-8010/udp")).toMatchObject({ host: { start: 8000, end: 8010 }, protocol: "udp" });
    expect(port("9000-9010:80")).toMatchObject({ host: { start: 9000, end: 9010 }, container: { start: 80, end: 80 } });
  });

  it("explains malformed ports", () => {
    expect(port("80:abc")).toBe("“abc” isn't a container port or range like 8080 or 8000-8010.");
    expect(port("70000:80")).toBe("70000 is outside 1–65535.");
    expect(port("0:80")).toBe("0 is outside 1–65535.");
    expect(port("90-80:90-80")).toBe("The range 90-80 runs backwards.");
    expect(port("8000-8002:80-81")).toBe("The host and container ranges are different sizes.");
    expect(port("80/http")).toBe("Unknown protocol “http”. Use tcp, udp or sctp.");
    expect(port("::1:80:80")).toMatch(/^Too many colons/);
    expect(port("host:80:80")).toBe("“host” isn't an IP address.");
    expect(port(":80")).toBe("Nothing before the colon. Use HOST:CONTAINER, or just CONTAINER.");
  });
});

describe("parseVolume", () => {
  it("tells named volumes, bind mounts and anonymous volumes apart", () => {
    expect(volume("db-data:/var/lib/postgresql/data")).toEqual({ kind: "named", source: "db-data", target: "/var/lib/postgresql/data", mode: "" });
    expect(volume("./src:/app:ro")).toEqual({ kind: "bind", source: "./src", target: "/app", mode: "ro" });
    expect(volume("~/cache:/cache")).toMatchObject({ kind: "bind" });
    expect(volume("/data")).toEqual({ kind: "anonymous", source: "", target: "/data", mode: "" });
    expect(volume("/data:ro")).toEqual({ kind: "anonymous", source: "", target: "/data", mode: "ro" });
    expect(volume("/host:/container")).toMatchObject({ kind: "bind", source: "/host", target: "/container" });
  });

  it("explains broken volumes", () => {
    expect(volume("data:app")).toBe("The path inside the container, “app”, must start with /.");
    expect(volume("src/app:/app")).toBe("“src/app” looks like a folder. Start relative paths with ./, like ./src/app.");
    expect(volume("./a:/b:rx")).toBe("Unknown mode “rx”. Use ro, rw, z, Z or nocopy.");
    expect(volume("a:/b:ro:x")).toMatch(/^Too many colons/);
    expect(volume("bad name:/b")).toMatch(/isn't a valid volume name/);
  });
});
