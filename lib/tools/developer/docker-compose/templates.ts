/**
 * Service presets and starter stacks. Images are pinned to a major version, databases keep their data
 * in a named volume and aren't published on the host, and every password is a placeholder read from .env.
 */
import { blankService, type EnvVar, type MakeId, type Service } from "./model";

type ServiceInit = Partial<Omit<Service, "id" | "environment">> & { environment?: [key: string, value: string, secret?: boolean][] };

function service(makeId: MakeId, init: ServiceInit): Service {
  const { environment = [], ...rest } = init;
  return {
    ...blankService(makeId),
    ...rest,
    environment: environment.map(([key, value, secret = false]): EnvVar => ({ id: makeId(), key, value, secret })),
  };
}

const healthcheck = (test: string) => ({ enabled: true, test, interval: "10s", timeout: "5s", retries: "5", startPeriod: "10s" });

export interface Preset {
  id: string;
  label: string;
  /** The service's name, made unique by the caller. */
  name: string;
  create: (makeId: MakeId, name: string) => Service;
}

export const PRESETS: Preset[] = [
  { id: "blank", label: "Blank service", name: "service", create: (makeId, name) => service(makeId, { name }) },
  {
    id: "node",
    label: "Node.js app",
    name: "app",
    create: (makeId, name) =>
      service(makeId, {
        name,
        source: "build",
        ports: "3000:3000",
        environment: [
          ["NODE_ENV", "production"],
          ["PORT", "3000"],
        ],
      }),
  },
  {
    id: "python",
    label: "Python app",
    name: "web",
    create: (makeId, name) =>
      service(makeId, {
        name,
        source: "build",
        ports: "8000:8000",
        environment: [["PYTHONUNBUFFERED", "1"]],
      }),
  },
  {
    id: "postgres",
    label: "PostgreSQL",
    name: "db",
    create: (makeId, name) =>
      service(makeId, {
        name,
        image: "postgres:17-alpine",
        environment: [
          ["POSTGRES_USER", "app"],
          ["POSTGRES_DB", "app"],
          ["POSTGRES_PASSWORD", "change-me", true],
        ],
        volumes: "db-data:/var/lib/postgresql/data",
        healthcheck: healthcheck("pg_isready -U app -d app"),
      }),
  },
  {
    id: "mysql",
    label: "MySQL",
    name: "db",
    create: (makeId, name) =>
      service(makeId, {
        name,
        image: "mysql:8.4",
        environment: [
          ["MYSQL_DATABASE", "app"],
          ["MYSQL_USER", "app"],
          ["MYSQL_PASSWORD", "change-me", true],
          ["MYSQL_ROOT_PASSWORD", "change-me-too", true],
        ],
        volumes: "mysql-data:/var/lib/mysql",
        healthcheck: healthcheck("mysqladmin ping -h localhost"),
      }),
  },
  {
    id: "mongo",
    label: "MongoDB",
    name: "mongo",
    create: (makeId, name) =>
      service(makeId, {
        name,
        image: "mongo:8",
        environment: [
          ["MONGO_INITDB_ROOT_USERNAME", "root"],
          ["MONGO_INITDB_ROOT_PASSWORD", "change-me", true],
        ],
        volumes: "mongo-data:/data/db",
        healthcheck: healthcheck(`mongosh --quiet --eval "db.adminCommand('ping')"`),
      }),
  },
  {
    id: "redis",
    label: "Redis",
    name: "redis",
    create: (makeId, name) =>
      service(makeId, {
        name,
        image: "redis:7-alpine",
        volumes: "redis-data:/data",
        healthcheck: healthcheck("redis-cli ping"),
      }),
  },
  {
    id: "nginx",
    label: "Nginx",
    name: "nginx",
    create: (makeId, name) =>
      service(makeId, {
        name,
        image: "nginx:1.27-alpine",
        ports: "80:80",
        volumes: "./nginx.conf:/etc/nginx/conf.d/default.conf:ro",
      }),
  },
];

export interface Template {
  id: string;
  label: string;
  /** What the stack needs that this tool doesn't write, like a Dockerfile. */
  note: string;
  create: (makeId: MakeId) => Service[];
}

export const TEMPLATES: Template[] = [
  {
    id: "node-postgres",
    label: "Node.js + PostgreSQL",
    note: "Expects a Dockerfile in the project folder that starts the app on port 3000.",
    create: (makeId) => [
      service(makeId, {
        name: "app",
        source: "build",
        ports: "3000:3000",
        environment: [
          ["NODE_ENV", "production"],
          ["DATABASE_URL", "postgres://app:change-me@db:5432/app", true],
        ],
        dependsOn: [{ service: "db", condition: "service_healthy" }],
      }),
      PRESETS.find((p) => p.id === "postgres")!.create(makeId, "db"),
    ],
  },
  {
    id: "django-postgres",
    label: "Django + PostgreSQL",
    note: "Expects a Dockerfile that installs gunicorn; change myproject to your Django project's name.",
    create: (makeId) => [
      service(makeId, {
        name: "web",
        source: "build",
        command: "gunicorn myproject.wsgi:application --bind 0.0.0.0:8000",
        workingDir: "/app",
        ports: "8000:8000",
        environment: [
          ["DJANGO_DEBUG", "0"],
          ["DJANGO_ALLOWED_HOSTS", "localhost"],
          ["DJANGO_SECRET_KEY", "change-me", true],
          ["DATABASE_URL", "postgres://django:change-me@db:5432/django", true],
        ],
        dependsOn: [{ service: "db", condition: "service_healthy" }],
      }),
      service(makeId, {
        name: "db",
        image: "postgres:17-alpine",
        environment: [
          ["POSTGRES_USER", "django"],
          ["POSTGRES_DB", "django"],
          ["POSTGRES_PASSWORD", "change-me", true],
        ],
        volumes: "db-data:/var/lib/postgresql/data",
        healthcheck: healthcheck("pg_isready -U django -d django"),
      }),
    ],
  },
  {
    id: "node-mongo",
    label: "Node.js + MongoDB",
    note: "Expects a Dockerfile in the project folder that starts the app on port 3000.",
    create: (makeId) => [
      service(makeId, {
        name: "app",
        source: "build",
        ports: "3000:3000",
        environment: [
          ["NODE_ENV", "production"],
          ["MONGODB_URI", "mongodb://root:change-me@mongo:27017/app?authSource=admin", true],
        ],
        dependsOn: [{ service: "mongo", condition: "service_healthy" }],
      }),
      PRESETS.find((p) => p.id === "mongo")!.create(makeId, "mongo"),
    ],
  },
  {
    id: "nginx-app",
    label: "Nginx + app server",
    note: "Expects an nginx.conf next to compose.yaml that proxies to http://app:3000, and a Dockerfile for the app.",
    create: (makeId) => [
      service(makeId, {
        name: "nginx",
        image: "nginx:1.27-alpine",
        ports: "80:80",
        volumes: "./nginx.conf:/etc/nginx/conf.d/default.conf:ro",
        networks: "web",
        dependsOn: [{ service: "app", condition: "service_healthy" }],
      }),
      service(makeId, {
        name: "app",
        source: "build",
        environment: [
          ["NODE_ENV", "production"],
          ["PORT", "3000"],
        ],
        networks: "web",
        // Node 18+ has fetch built in, so this works without curl or wget in the image.
        healthcheck: healthcheck(`node -e "fetch('http://localhost:3000').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"`),
      }),
    ],
  },
];

/** `base`, or `base-2`, `base-3`… if that name is taken. */
export function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
