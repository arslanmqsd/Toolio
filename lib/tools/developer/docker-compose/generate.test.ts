import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { generateCompose, generateEnvExample, namedVolumes } from "./generate";
import { blankService, sequentialIds, type ComposeProject, type Service } from "./model";
import { TEMPLATES } from "./templates";

const makeId = sequentialIds();
const svc = (overrides: Partial<Service>): Service => ({ ...blankService(makeId), ...overrides });
const project = (...services: Service[]): ComposeProject => ({ name: "", services });

describe("generateCompose", () => {
  it("writes the Node.js + PostgreSQL stack exactly", () => {
    const yaml = generateCompose({ name: "shop", services: TEMPLATES[0].create(sequentialIds()) });
    expect(yaml).toBe(`name: shop
services:
  app:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: \${DATABASE_URL}
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_DB: app
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U app -d app
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
volumes:
  db-data:
`);
  });

  it("is valid YAML that reads back as the same structure", () => {
    for (const t of TEMPLATES) {
      const services = t.create(sequentialIds());
      const parsed = parse(generateCompose(project(...services)));
      expect(Object.keys(parsed.services)).toEqual(services.map((s) => s.name));
    }
  });

  it("writes build with a Dockerfile, an image name, command and working dir", () => {
    const yaml = generateCompose(
      project(svc({ name: "api", source: "build", buildContext: "./api", dockerfile: "Dockerfile.prod", image: "me/api:1.0", command: "npm start", workingDir: "/srv", restart: "" })),
    );
    expect(parse(yaml).services.api).toEqual({ build: { context: "./api", dockerfile: "Dockerfile.prod" }, image: "me/api:1.0", command: "npm start", working_dir: "/srv" });
  });

  it("uses the short depends_on list when every condition is service_started", () => {
    const yaml = generateCompose(
      project(svc({ name: "a", image: "x:1", dependsOn: [{ service: "b", condition: "service_started" }] }), svc({ name: "b", image: "x:1" })),
    );
    expect(parse(yaml).services.a.depends_on).toEqual(["b"]);
  });

  it("lists named volumes and networks once, in first-used order, but not bind mounts", () => {
    const p = project(
      svc({ name: "a", image: "x:1", volumes: "cache:/c\n./src:/app\n/anon", networks: "front\nback" }),
      svc({ name: "b", image: "x:1", volumes: "data:/d\ncache:/c2", networks: "back" }),
    );
    expect(namedVolumes(p)).toEqual(["cache", "data"]);
    const parsed = parse(generateCompose(p));
    expect(parsed.volumes).toEqual({ cache: null, data: null });
    expect(parsed.networks).toEqual({ front: null, back: null });
  });

  it("quotes ports, escapes $ in plain values, skips blank lines and env rows", () => {
    const yaml = generateCompose(
      project(
        svc({
          name: "a",
          image: "x:1",
          ports: "\n22:22\n\n",
          envFiles: ".env",
          environment: [
            { id: "1", key: "PRICE", value: "$5", secret: false },
            { id: "2", key: "", value: "", secret: false },
            { id: "3", key: "ON", value: "true", secret: false },
          ],
        }),
      ),
    );
    expect(yaml).toContain('      - "22:22"\n');
    expect(yaml).toContain("PRICE: $$5");
    expect(yaml).toContain('ON: "true"');
    expect(parse(yaml).services.a.env_file).toEqual([".env"]);
  });

  it("leaves out unnamed and repeated services and never writes version:", () => {
    const yaml = generateCompose(project(svc({ name: "", image: "x:1" }), svc({ name: "a", image: "x:1" }), svc({ name: "a", image: "y:1" })));
    expect(parse(yaml)).toEqual({ services: { a: { image: "x:1", restart: "unless-stopped" } } });
    expect(generateCompose(project())).toBe("services: {}\n");
  });

  it("skips an enabled health check with no command", () => {
    const yaml = generateCompose(project(svc({ name: "a", image: "x:1", healthcheck: { enabled: true, test: " ", interval: "", timeout: "", retries: "", startPeriod: "" } })));
    expect(parse(yaml).services.a.healthcheck).toBeUndefined();
  });
});

describe("generateEnvExample", () => {
  it("lists each secret once with its example, quoting when needed", () => {
    const env = generateEnvExample(
      project(
        svc({
          name: "a",
          environment: [
            { id: "1", key: "DB_PASSWORD", value: "", secret: true },
            { id: "2", key: "GREETING", value: "hello world", secret: true },
            { id: "3", key: "PUBLIC", value: "yes", secret: false },
          ],
        }),
        svc({ name: "b", environment: [{ id: "4", key: "DB_PASSWORD", value: "other", secret: true }] }),
      ),
    );
    expect(env.keys).toEqual(["DB_PASSWORD", "GREETING"]);
    expect(env.text).toMatch(/^# Copy to \.env/);
    expect(env.text).toContain("DB_PASSWORD=change-me\nGREETING='hello world'\n");
    expect(env.text).not.toContain("PUBLIC");
  });

  it("is empty without secrets", () => {
    expect(generateEnvExample(project(svc({ name: "a" })))).toEqual({ text: "", keys: [] });
  });
});
