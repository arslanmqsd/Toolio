"use client";

import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { CodeInput, CodeTextArea } from "@/components/ui/CodeField";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import type { DependsOnCondition, EnvVar, MakeId, RestartPolicy, Service } from "@/lib/tools/developer/docker-compose/model";
import type { Issue, IssueField } from "@/lib/tools/developer/docker-compose/validate";

const SOURCES = [
  { id: "image", label: "Image" },
  { id: "build", label: "Build" },
] as const;

const RESTART: { id: RestartPolicy; label: string }[] = [
  { id: "unless-stopped", label: "unless-stopped: restart unless you stop it" },
  { id: "always", label: "always" },
  { id: "on-failure", label: "on-failure: only after a crash" },
  { id: "no", label: "no" },
  { id: "", label: "Not set (Docker's default, no)" },
];

const CONDITIONS: { id: DependsOnCondition; label: string }[] = [
  { id: "service_started", label: "has started" },
  { id: "service_healthy", label: "is healthy" },
  { id: "service_completed_successfully", label: "has finished" },
];

interface ServiceEditorProps {
  service: Service;
  /** Every service's name, this one's included, for depends_on. */
  serviceNames: string[];
  issues: Issue[];
  makeId: MakeId;
  onChange: (service: Service) => void;
}

/** Messages for one field, under it, with an id the field can point at. */
function FieldIssues({ id, issues }: { id: string; issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul id={id} className="space-y-1 text-xs">
      {issues.map((issue) => (
        <li key={issue.message} className={issue.level === "error" ? "text-[color:var(--error)]" : "text-[color:var(--accent-warn-text)]"}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

export default function ServiceEditor({ service: s, serviceNames, issues, makeId, onChange }: ServiceEditorProps) {
  const set = <K extends keyof Service>(key: K, value: Service[K]) => onChange({ ...s, [key]: value });
  const prefix = `svc-${s.id}`;
  const fieldIssues = (field: IssueField) => issues.filter((i) => i.field === field);
  // Wires a field to its messages: the error border, and aria-describedby for screen readers.
  const describe = (field: IssueField) => {
    const list = fieldIssues(field);
    return {
      invalid: list.some((i) => i.level === "error"),
      "aria-describedby": list.length ? `${prefix}-${field}-issues` : undefined,
    };
  };
  const issuesFor = (field: IssueField) => <FieldIssues id={`${prefix}-${field}-issues`} issues={fieldIssues(field)} />;

  function setEnv(id: string, patch: Partial<EnvVar>) {
    set(
      "environment",
      s.environment.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    );
  }

  const others = serviceNames.filter((n) => n && n !== s.name.trim());
  const dependency = (name: string) => s.dependsOn.find((d) => d.service === name);
  function toggleDependency(name: string, on: boolean) {
    set("dependsOn", on ? [...s.dependsOn, { service: name, condition: "service_started" }] : s.dependsOn.filter((d) => d.service !== name));
  }
  // Dependencies on services that were renamed or removed, so they can be seen and taken out.
  const missing = s.dependsOn.filter((d) => d.service && !others.includes(d.service));

  const h = s.healthcheck;
  const setHealth = (patch: Partial<Service["healthcheck"]>) => set("healthcheck", { ...h, ...patch });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service name" htmlFor={`${prefix}-name`} help="Other services reach it at this host name.">
          <CodeInput id={`${prefix}-name`} value={s.name} onChange={(e) => set("name", e.target.value)} placeholder="web" {...describe("name")} />
          {issuesFor("name")}
        </Field>
        <Field label="Restart" htmlFor={`${prefix}-restart`}>
          <Select id={`${prefix}-restart`} value={s.restart} onChange={(e) => set("restart", e.target.value as RestartPolicy)}>
            {RESTART.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="space-y-3">
        <SegmentedControl label="Run from" options={SOURCES} value={s.source} onChange={(v) => set("source", v)} />
        {s.source === "image" ? (
          <Field label="Image" htmlFor={`${prefix}-image`} help="Pin a version, like postgres:17-alpine.">
            <CodeInput id={`${prefix}-image`} value={s.image} onChange={(e) => set("image", e.target.value)} placeholder="nginx:1.27-alpine" {...describe("image")} />
            {issuesFor("image")}
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Build context" htmlFor={`${prefix}-context`} help="Folder with the Dockerfile.">
              <CodeInput id={`${prefix}-context`} value={s.buildContext} onChange={(e) => set("buildContext", e.target.value)} placeholder="." {...describe("build")} />
              {issuesFor("build")}
            </Field>
            <Field label="Dockerfile" htmlFor={`${prefix}-dockerfile`} help="Blank for Dockerfile.">
              <CodeInput id={`${prefix}-dockerfile`} value={s.dockerfile} onChange={(e) => set("dockerfile", e.target.value)} placeholder="Dockerfile" />
            </Field>
            <Field label="Image name" htmlFor={`${prefix}-image`} help="Optional tag for the build.">
              <CodeInput id={`${prefix}-image`} value={s.image} onChange={(e) => set("image", e.target.value)} placeholder="myapp:dev" {...describe("image")} />
              {issuesFor("image")}
            </Field>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Command" htmlFor={`${prefix}-command`} help="Blank keeps the image's own.">
          <CodeInput id={`${prefix}-command`} value={s.command} onChange={(e) => set("command", e.target.value)} placeholder="npm start" />
        </Field>
        <Field label="Working directory" htmlFor={`${prefix}-workdir`}>
          <CodeInput id={`${prefix}-workdir`} value={s.workingDir} onChange={(e) => set("workingDir", e.target.value)} placeholder="/app" />
        </Field>
      </div>

      <Field label="Ports" htmlFor={`${prefix}-ports`} help="One per line, HOST:CONTAINER: 8080:80, 127.0.0.1:5432:5432, 53:53/udp.">
        <CodeTextArea id={`${prefix}-ports`} value={s.ports} onChange={(e) => set("ports", e.target.value)} rows={2} {...describe("ports")} />
        {issuesFor("ports")}
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Environment variables</legend>
        <p className="text-xs text-[color:var(--text-muted)]">
          Secrets are written as $&#123;NAME&#125; and read from .env; their value here only goes into .env.example, so use a placeholder.
        </p>
        {s.environment.length > 0 && (
          <ul className="space-y-2">
            {s.environment.map((v, i) => (
              <li key={v.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_auto] sm:items-center">
                <CodeInput aria-label={`Variable ${i + 1} name`} value={v.key} onChange={(e) => setEnv(v.id, { key: e.target.value })} placeholder="NAME" className="col-span-2 sm:col-span-1" />
                <CodeInput
                  aria-label={v.secret ? `Variable ${i + 1} example for .env.example` : `Variable ${i + 1} value`}
                  value={v.value}
                  onChange={(e) => setEnv(v.id, { value: e.target.value })}
                  placeholder={v.secret ? "change-me" : "value"}
                  className="col-span-2 sm:col-span-1"
                />
                <Checkbox checked={v.secret} onChange={(secret) => setEnv(v.id, { secret })}>
                  Secret
                </Checkbox>
                <button
                  type="button"
                  onClick={() => set("environment", s.environment.filter((e) => e.id !== v.id))}
                  aria-label={`Remove variable ${v.key || i + 1}`}
                  className="justify-self-end rounded p-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--error)]"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {issuesFor("environment")}
        <Button size="sm" icon={Plus} onClick={() => set("environment", [...s.environment, { id: makeId(), key: "", value: "", secret: false }])}>
          Add variable
        </Button>
      </fieldset>

      <Field label="Env files" htmlFor={`${prefix}-envfiles`} help="One per line. Loaded into the container, e.g. .env; keep them out of version control.">
        <CodeTextArea id={`${prefix}-envfiles`} value={s.envFiles} onChange={(e) => set("envFiles", e.target.value)} rows={1} {...describe("envFiles")} />
        {issuesFor("envFiles")}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Volumes" htmlFor={`${prefix}-volumes`} help="One per line: db-data:/data (named), ./src:/app:ro (folder).">
          <CodeTextArea id={`${prefix}-volumes`} value={s.volumes} onChange={(e) => set("volumes", e.target.value)} rows={2} {...describe("volumes")} />
          {issuesFor("volumes")}
        </Field>
        <Field label="Networks" htmlFor={`${prefix}-networks`} help="One per line. Blank joins the default network.">
          <CodeTextArea id={`${prefix}-networks`} value={s.networks} onChange={(e) => set("networks", e.target.value)} rows={2} {...describe("networks")} />
          {issuesFor("networks")}
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Starts after</legend>
        {others.length === 0 && missing.length === 0 ? (
          <p className="text-xs text-[color:var(--text-muted)]">Add another service to wait for it.</p>
        ) : (
          <ul className="space-y-2">
            {others.map((name) => {
              const dep = dependency(name);
              return (
                <li key={name} className="flex flex-wrap items-center gap-3">
                  <Checkbox checked={Boolean(dep)} onChange={(on) => toggleDependency(name, on)}>
                    <span className="font-[family-name:var(--font-mono)]">{name}</span>
                  </Checkbox>
                  {dep && (
                    <Select
                      aria-label={`Wait until ${name}`}
                      value={dep.condition}
                      onChange={(e) =>
                        set(
                          "dependsOn",
                          s.dependsOn.map((d) => (d.service === name ? { ...d, condition: e.target.value as DependsOnCondition } : d)),
                        )
                      }
                      className="w-44"
                    >
                      {CONDITIONS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </li>
              );
            })}
            {missing.map((d) => (
              <li key={d.service} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-[family-name:var(--font-mono)] text-[color:var(--error)]">{d.service}</span>
                <Button size="sm" onClick={() => toggleDependency(d.service, false)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {issuesFor("dependsOn")}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="sr-only">Health check</legend>
        <Checkbox checked={h.enabled} onChange={(enabled) => setHealth({ enabled })}>
          Health check
        </Checkbox>
        {h.enabled && (
          <>
            <Field label="Command" htmlFor={`${prefix}-hc-test`} help="Runs in the container's shell; exit code 0 means healthy.">
              <CodeInput id={`${prefix}-hc-test`} value={h.test} onChange={(e) => setHealth({ test: e.target.value })} placeholder="curl -f http://localhost/ || exit 1" {...describe("healthcheck")} />
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["interval", "Interval", "10s"],
                  ["timeout", "Timeout", "5s"],
                  ["retries", "Retries", "5"],
                  ["startPeriod", "Start period", "10s"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <Field key={key} label={label} htmlFor={`${prefix}-hc-${key}`}>
                  <CodeInput id={`${prefix}-hc-${key}`} value={h[key]} onChange={(e) => setHealth({ [key]: e.target.value })} placeholder={placeholder} />
                </Field>
              ))}
            </div>
            {issuesFor("healthcheck")}
          </>
        )}
      </fieldset>
    </div>
  );
}
