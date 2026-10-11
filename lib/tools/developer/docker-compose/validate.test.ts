import { describe, expect, it } from "vitest";
import { blankService, sequentialIds, type ComposeProject, type Service } from "./model";
import { validateProject } from "./validate";

const makeId = sequentialIds();
const svc = (overrides: Partial<Service>): Service => ({ ...blankService(makeId), image: "app:1.0", ...overrides });
const issues = (...services: Service[]) => validateProject({ name: "", services }).map((i) => `${i.level}: ${i.message}`);
const has = (list: string[], pattern: RegExp) => expect(list.some((m) => pattern.test(m)), list.join("\n")).toBe(true);

describe("validateProject", () => {
  it("passes a clean project", () => {
    expect(issues(svc({ name: "web", ports: "8080:80" }))).toEqual([]);
  });

  it("needs services, names, unique names and valid project names", () => {
    expect(issues()).toEqual(["error: Add at least one service."]);
    has(issues(svc({ name: "" })), /^error: Service 1 has no name/);
    has(issues(svc({ name: "my app" })), /^error: “my app”: names may only use/);
    has(issues(svc({ name: "a" }), svc({ name: "a" })), /^error: More than one service is called “a”/);
    const p: ComposeProject = { name: "My Project", services: [svc({ name: "a" })] };
    has(validateProject(p).map((i) => i.message), /project name/);
  });

  it("needs an image or a build context, and flags unpinned images", () => {
    has(issues(svc({ name: "a", image: "" })), /^error: “a” needs an image/);
    has(issues(svc({ name: "a", source: "build", image: "", buildContext: " " })), /^error: “a” needs a build context/);
    has(issues(svc({ name: "a", image: "nginx" })), /^warning: “a” uses no tag/);
    has(issues(svc({ name: "a", image: "nginx:latest" })), /^warning: “a” uses the latest tag/);
    expect(issues(svc({ name: "a", image: "localhost:5000/app@sha256:abc" }))).toEqual([]);
    expect(issues(svc({ name: "a", source: "build", image: "" }))).toEqual([]);
  });

  it("points at malformed ports by line", () => {
    has(issues(svc({ name: "a", ports: "80\n\n8080:abc" })), /^error: “a”, port line 3: “abc” isn't a container port/);
  });

  it("catches a host port published twice, across addresses and services", () => {
    has(issues(svc({ name: "a", ports: "8080:80" }), svc({ name: "b", ports: "8080:81" })), /^error: Host port 8080\/tcp is published by both “a” and “b”/);
    has(issues(svc({ name: "a", ports: "127.0.0.1:8080:80" }), svc({ name: "b", ports: "8080:81" })), /published by both/);
    has(issues(svc({ name: "a", ports: "8000-8005:8000-8005" }), svc({ name: "b", ports: "8003:80" })), /Host port 8003/);
    expect(issues(svc({ name: "a", ports: "127.0.0.1:8080:80" }), svc({ name: "b", ports: "127.0.0.2:8080:80" }))).toEqual([]);
    expect(issues(svc({ name: "a", ports: "53:53/tcp\n53:53/udp" }))).toEqual([]);
  });

  it("warns about databases published on every network", () => {
    has(issues(svc({ name: "db", image: "postgres:17", ports: "5432:5432" })), /^warning: “db” publishes PostgreSQL on port 5432 to every network/);
    expect(issues(svc({ name: "db", image: "postgres:17", ports: "127.0.0.1:5432:5432" }))).toEqual([]);
  });

  it("checks environment names, repeats and secrets left in the file", () => {
    const env = (key: string, value = "x", secret = false) => ({ id: key + value, key, value, secret });
    has(issues(svc({ name: "a", environment: [env("1BAD")] })), /“1BAD” isn't a valid variable name/);
    has(issues(svc({ name: "a", environment: [env("A"), env("A", "y")] })), /^error: “a” sets A more than once/);
    has(issues(svc({ name: "a", environment: [env("", "orphan")] })), /value with no name/);
    has(issues(svc({ name: "a", environment: [env("API_KEY", "abc123")] })), /^warning: “a”: API_KEY looks like a secret/);
    expect(issues(svc({ name: "a", environment: [env("API_KEY", "abc123", true)] }))).toEqual([]);
  });

  it("checks env files", () => {
    has(issues(svc({ name: "a", envFiles: ".env.example" })), /holds placeholders/);
    has(issues(svc({ name: "a", envFiles: "my env" })), /has spaces/);
  });

  it("checks volumes, repeated targets and risky mounts", () => {
    has(issues(svc({ name: "a", volumes: "data:app" })), /^error: “a”, volume line 1: The path inside the container/);
    has(issues(svc({ name: "a", volumes: "x:/data\ny:/data" })), /mounts two volumes at \/data/);
    has(issues(svc({ name: "a", volumes: "/var/run/docker.sock:/var/run/docker.sock" })), /^warning: .*control of your machine/);
  });

  it("checks network names", () => {
    has(issues(svc({ name: "a", networks: "front end" })), /network line 1: “front end” isn't a valid network name/);
    has(issues(svc({ name: "a", networks: "web\nweb" })), /lists the network web twice/);
  });

  it("checks depends_on references, health and shared networks", () => {
    const dep = (service: string, condition: Service["dependsOn"][number]["condition"] = "service_started") => [{ service, condition }];
    has(issues(svc({ name: "a", dependsOn: dep("ghost") })), /^error: “a” depends on “ghost”, which isn't a service here/);
    has(issues(svc({ name: "a", dependsOn: dep("a") })), /^error: “a” depends on itself/);
    has(issues(svc({ name: "a", dependsOn: dep("b", "service_healthy") }), svc({ name: "b" })), /no health check, so it never will be/);
    has(issues(svc({ name: "a", networks: "front", dependsOn: dep("b") }), svc({ name: "b", networks: "back" })), /share no network/);
    has(issues(svc({ name: "a", dependsOn: dep("b") }), svc({ name: "b", networks: "back" })), /share no network/);
    expect(issues(svc({ name: "a", networks: "x", dependsOn: dep("b") }), svc({ name: "b", networks: "x\ny" }))).toEqual([]);
  });

  it("finds depends_on cycles", () => {
    const dep = (service: string) => [{ service, condition: "service_started" as const }];
    has(issues(svc({ name: "a", dependsOn: dep("b") }), svc({ name: "b", dependsOn: dep("c") }), svc({ name: "c", dependsOn: dep("a") })), /circle: a → b → c → a/);
  });

  it("checks health check commands and durations", () => {
    const hc = (overrides: Partial<Service["healthcheck"]>) => ({ enabled: true, test: "true", interval: "", timeout: "", retries: "", startPeriod: "", ...overrides });
    has(issues(svc({ name: "a", healthcheck: hc({ test: "" }) })), /health check with no command/);
    has(issues(svc({ name: "a", healthcheck: hc({ interval: "10" }) })), /interval “10” isn't a duration/);
    has(issues(svc({ name: "a", healthcheck: hc({ retries: "three" }) })), /retries must be a whole number/);
    expect(issues(svc({ name: "a", healthcheck: hc({ interval: "1m30s", timeout: "500ms", retries: "3", startPeriod: "5s" }) }))).toEqual([]);
  });

  it("ties each issue to its service and field", () => {
    const s = svc({ name: "a", ports: "x" });
    expect(validateProject({ name: "", services: [s] })[0]).toMatchObject({ serviceId: s.id, field: "ports" });
  });
});
