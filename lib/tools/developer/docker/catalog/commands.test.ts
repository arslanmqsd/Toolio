import { describe, expect, it } from "vitest";
import { command, danger, preset, resolve, steps } from "./test-helpers";

describe("containers", () => {
  it("builds docker run with every kind of option", () => {
    expect(
      command("run", {
        image: "node:22-alpine",
        name: "api",
        ports: "3000:3000\n127.0.0.1:9229:9229",
        env: "NODE_ENV=production\nAPI_TOKEN",
        envFile: ".env",
        volumes: "./src:/app/src:ro\nnode_modules:/app/node_modules",
        network: "backend",
        restart: "unless-stopped",
        memory: "512m",
        cpus: "1.5",
        user: "1000:1000",
        workdir: "/app",
        healthCmd: "wget -qO- http://localhost:3000/health || exit 1",
        healthInterval: "30s",
        command: "npm run start",
        rm: true,
      }),
    ).toBe(
      "docker run -d --rm --name api -p 3000:3000 -p 127.0.0.1:9229:9229 -e NODE_ENV=production -e API_TOKEN --env-file .env -v ./src:/app/src:ro -v node_modules:/app/node_modules --network backend --restart unless-stopped --memory 512m --cpus 1.5 --user 1000:1000 --workdir /app --health-cmd 'wget -qO- http://localhost:3000/health || exit 1' --health-interval 30s node:22-alpine npm run start",
    );
  });

  it("quotes for PowerShell where Bash and PowerShell differ", () => {
    const values = { image: "nginx:1.27", env: "GREETING=hello world", volumes: "./site:/usr/share/nginx/html", command: "echo a,b" };
    expect(command("run", values)).toBe("docker run -d -e 'GREETING=hello world' -v ./site:/usr/share/nginx/html nginx:1.27 echo a,b");
    expect(command("run", values, "powershell")).toBe("docker run -d -e 'GREETING=hello world' -v './site:/usr/share/nginx/html' nginx:1.27 echo 'a,b'");
  });

  it("never lets field values break out into shell syntax", () => {
    const out = command("run", { image: "nginx:1.27", name: "web", command: "sh -c 'echo hi; rm -rf /'" });
    expect(out).toBe("docker run -d --name web nginx:1.27 sh -c 'echo hi; rm -rf /'");
    expect(command("run", { image: "nginx:1.27", command: `sh -c "echo \\"hi\\" && ls"` }, "powershell")).toBe(`docker run -d nginx:1.27 sh -c 'echo "hi" && ls'`);
    expect(resolve("run", { image: "nginx:1.27", command: "sh -c 'oops" })).toMatchObject({ status: "invalid", errors: { command: "A ' quote isn't closed." } });
    expect(command("exec", { container: "web", command: "$(whoami)" })).toBe("docker exec -it web '$(whoami)'");
    expect(command("exec", { container: "web", command: "$(whoami)" }, "powershell")).toBe("docker exec -it web '$(whoami)'");
  });

  it("notes secret-looking environment values and pass-through variables", () => {
    const [s] = steps("run", { image: "x:1", env: "DB_PASSWORD=hunter2\nAPI_KEY" });
    expect(s.notes?.join(" ")).toMatch(/DB_PASSWORD looks like a secret/);
    expect(s.notes?.join(" ")).toMatch(/passed on from your shell/);
  });

  it("flags mounting the Docker socket", () => {
    expect(danger("run", { image: "x:1", volumes: "/var/run/docker.sock:/var/run/docker.sock" })).toBe("caution");
  });

  it("explains bad fields", () => {
    expect(resolve("run", { image: "Nginx:latest" })).toMatchObject({ status: "invalid", errors: { image: "Image names must be lower case, like my-app:1.0." } });
    expect(resolve("run", { image: "x:1", ports: "80\n99999:80" })).toEqual({ status: "invalid", errors: { ports: "Line 2: 99999 is outside 1–65535." } });
    expect(resolve("run", { image: "x:1", memory: "lots" })).toMatchObject({ errors: { memory: expect.stringMatching(/512m/) } });
  });

  it("shows placeholders while required fields are empty", () => {
    const r = resolve("run");
    expect(r.status).toBe("incomplete");
    expect(r.status === "incomplete" && r.steps[0].parts.at(-1)?.text).toBe("<image>");
  });

  it("builds the other container commands", () => {
    expect(command("create", { image: "redis:7" })).toBe("docker create redis:7");
    expect(command("start", { containers: "web db", attach: true })).toBe("docker start -a web db");
    expect(command("stop", { containers: "web", time: "30" })).toBe("docker stop --time 30 web");
    expect(command("restart", { containers: "web" })).toBe("docker restart web");
    expect(command("exec", { container: "db", command: "psql -U app", user: "postgres" })).toBe("docker exec -it --user postgres db psql -U app");
    expect(command("logs", { container: "web", tail: "100", since: "10m", timestamps: true })).toBe("docker logs -f --tail 100 --since 10m -t web");
    expect(command("inspect", { targets: "web", format: "{{.State.Status}}" })).toBe("docker inspect --format '{{.State.Status}}' web");
    expect(command("ps", { quiet: true, filter: "status=exited" })).toBe("docker ps -a -q --filter status=exited");
    expect(command("stats", { noStream: true })).toBe("docker stats --no-stream");
  });

  it("asks for confirmation before force-removing containers or their volumes", () => {
    expect(steps("rm", { containers: "web" })[0]).toMatchObject({ danger: "caution", confirm: undefined });
    expect(steps("rm", { containers: "web", force: true })[0]).toMatchObject({ danger: "destructive", confirm: expect.any(String) });
    expect(command("rm", { containers: "web", force: true, volumes: true })).toBe("docker rm -f -v web");
  });
});

describe("presets", () => {
  it("runs PostgreSQL on this machine only, with the password from the shell", () => {
    expect(command("run", preset("run", "postgres"))).toBe(
      "docker run -d --name db -p 127.0.0.1:5432:5432 -e POSTGRES_USER=app -e POSTGRES_DB=app -e POSTGRES_PASSWORD -v pgdata:/var/lib/postgresql/data --restart unless-stopped --health-cmd 'pg_isready -U app -d app' --health-interval 10s postgres:17-alpine",
    );
  });

  it.each(["nginx", "node", "python", "mongo", "redis"])("%s builds a ready command with a pinned image", (id) => {
    const out = command("run", preset("run", id));
    expect(out).toMatch(/^docker run -d --name /);
    expect(out).not.toMatch(/:latest\b/);
  });
});

describe("images", () => {
  it("builds docker build with tags, args and options", () => {
    expect(
      command("build", { tags: "app:1.0 app:latest", dockerfile: "Dockerfile.prod", buildArgs: "NODE_VERSION=22", target: "prod", platform: "linux/amd64", noCache: true, pull: true }),
    ).toBe("docker build -t app:1.0 -t app:latest -f Dockerfile.prod --build-arg NODE_VERSION=22 --target prod --platform linux/amd64 --no-cache --pull .");
    expect(steps("build", { tags: "app:1", buildArgs: "NPM_TOKEN=abc" })[0].notes?.[0]).toMatch(/NPM_TOKEN looks like a secret/);
  });

  it("builds pull, push, tag, images and rmi", () => {
    expect(command("pull", { image: "postgres:17", platform: "linux/arm64" })).toBe("docker pull --platform linux/arm64 postgres:17");
    expect(command("push", { image: "ghcr.io/me/app:1.0" })).toBe("docker push ghcr.io/me/app:1.0");
    expect(danger("push", { image: "me/app:1" })).toBe("caution");
    expect(command("tag", { source: "app:1.0", target: "ghcr.io/me/app:1.0" })).toBe("docker tag app:1.0 ghcr.io/me/app:1.0");
    expect(command("images", { dangling: true })).toBe("docker images --filter dangling=true");
    expect(command("rmi", { images: "app:1.0", force: true })).toBe("docker rmi -f app:1.0");
    expect(danger("rmi", { images: "app:1.0", force: true })).toBe("destructive");
  });
});

describe("networks and volumes", () => {
  it("builds network commands", () => {
    expect(command("network-create", { network: "backend", driver: "bridge", subnet: "172.28.0.0/16", internal: true })).toBe("docker network create --subnet 172.28.0.0/16 --internal backend");
    expect(command("network-create", { network: "swarm", driver: "overlay" })).toBe("docker network create --driver overlay swarm");
    expect(command("network-connect", { network: "backend", container: "api", alias: "service" })).toBe("docker network connect --alias service backend api");
    expect(command("network-disconnect", { network: "backend", container: "api" })).toBe("docker network disconnect backend api");
  });

  it("always asks for confirmation before deleting volumes", () => {
    expect(command("volume-create", { volume: "pgdata" })).toBe("docker volume create pgdata");
    expect(command("volume-inspect", { volumes: "pgdata cache" })).toBe("docker volume inspect pgdata cache");
    const [s] = steps("volume-rm", { volumes: "pgdata" });
    expect(s).toMatchObject({ danger: "destructive", confirm: expect.stringMatching(/deleted for good/) });
    expect(s.warning).toMatch(/no undo/);
  });
});

describe("registry", () => {
  it("pipes the token in, per shell, and never takes a password", () => {
    expect(command("login", { registry: "ghcr.io", username: "me" })).toBe(`printf '%s' "$REGISTRY_TOKEN" | docker login --username me --password-stdin ghcr.io`);
    expect(command("login", { registry: "ghcr.io", username: "me" }, "powershell")).toBe("$env:REGISTRY_TOKEN | docker login --username me --password-stdin ghcr.io");
    expect(command("login", { username: "me", source: "file", tokenFile: "my token.txt" })).toBe("cat 'my token.txt' | docker login --username me --password-stdin");
    expect(command("login", { username: "me", source: "file", tokenFile: "token.txt" }, "powershell")).toBe("Get-Content token.txt | docker login --username me --password-stdin");
    expect(resolve("login", { username: "me", tokenVar: "$(evil)" })).toMatchObject({ status: "invalid" });
  });

  it("logs out", () => {
    expect(command("logout")).toBe("docker logout");
    expect(command("logout", { registry: "ghcr.io" })).toBe("docker logout ghcr.io");
  });
});

describe("system", () => {
  it("prunes, asking for confirmation only for images and volumes", () => {
    expect(command("prune")).toBe("docker system prune");
    expect(steps("prune")[0]).toMatchObject({ danger: "destructive", confirm: undefined });
    const [wide] = steps("prune", { all: true, volumes: true, until: "24h", force: true });
    expect(wide.parts.map((p) => p.text).join(" ")).toBe("docker system prune -a --volumes --filter until=24h -f");
    expect(wide.confirm).toBeTruthy();
    expect(wide.warning).toMatch(/Every volume not attached/);
    expect(command("system-df", { verbose: true })).toBe("docker system df -v");
  });
});
