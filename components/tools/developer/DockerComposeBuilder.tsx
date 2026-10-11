"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Plus, Trash2, XCircle } from "lucide-react";
import { DownloadButton, InputPanel, OutputPanel } from "@/components/tool-shell/ToolPanels";
import Button from "@/components/ui/Button";
import CodeBlock from "@/components/ui/CodeBlock";
import { CodeInput } from "@/components/ui/CodeField";
import Dialog from "@/components/ui/Dialog";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Select from "@/components/ui/Select";
import { generateCompose, generateEnvExample } from "@/lib/tools/developer/docker-compose/generate";
import { sequentialIds, type ComposeProject, type Service } from "@/lib/tools/developer/docker-compose/model";
import { PRESETS, TEMPLATES, uniqueName } from "@/lib/tools/developer/docker-compose/templates";
import { validateProject, type Issue } from "@/lib/tools/developer/docker-compose/validate";
import ServiceEditor from "./docker-compose/ServiceEditor";

const DEFAULT_TEMPLATE = TEMPLATES[0];

// The same ids on the server and in the browser, so the first render matches.
const initialProject = (): ComposeProject => ({ name: "", services: DEFAULT_TEMPLATE.create(sequentialIds("init")) });

const OUTPUTS = [
  { id: "compose", label: "compose.yaml" },
  { id: "env", label: ".env.example" },
] as const;

type Output = (typeof OUTPUTS)[number]["id"];

function IssueIcon({ level }: { level: Issue["level"] }) {
  return level === "error" ? (
    <XCircle aria-label="Error" className="mt-px h-3.5 w-3.5 shrink-0 text-[color:var(--error)]" />
  ) : (
    <AlertTriangle aria-label="Warning" className="mt-px h-3.5 w-3.5 shrink-0 text-[color:var(--accent-warn-text)]" />
  );
}

export default function DockerComposeBuilder() {
  const [project, setProject] = useState<ComposeProject>(initialProject);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE.id);
  const [loadedTemplate, setLoadedTemplate] = useState(DEFAULT_TEMPLATE.id);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [presetId, setPresetId] = useState("blank");
  const [output, setOutput] = useState<Output>("compose");
  const [dirty, setDirty] = useState(false);
  const counter = useRef(0);
  // Ids for things added in the browser; they never need to match a server render.
  const makeId = useRef(() => `n-${++counter.current}`).current;

  const yaml = useMemo(() => generateCompose(project), [project]);
  const env = useMemo(() => generateEnvExample(project), [project]);
  const issues = useMemo(() => validateProject(project), [project]);
  const errors = issues.filter((i) => i.level === "error").length;
  const names = project.services.map((s) => s.name.trim());
  const showing: Output = output === "env" && env.text ? "env" : "compose";
  const template = TEMPLATES.find((t) => t.id === loadedTemplate);

  function update(next: ComposeProject) {
    setProject(next);
    setDirty(true);
  }

  function updateService(service: Service) {
    const before = project.services.find((s) => s.id === service.id);
    const oldName = before?.name.trim();
    const newName = service.name.trim();
    // Keep depends_on pointing at a service when it's renamed.
    const renamed = oldName && newName && oldName !== newName && !names.includes(newName);
    update({
      ...project,
      services: project.services.map((s) => {
        if (s.id === service.id) return service;
        if (!renamed) return s;
        return { ...s, dependsOn: s.dependsOn.map((d) => (d.service === oldName ? { ...d, service: newName } : d)) };
      }),
    });
  }

  function removeService(id: string) {
    const name = project.services.find((s) => s.id === id)?.name.trim();
    update({
      ...project,
      services: project.services.filter((s) => s.id !== id).map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => d.service !== name) })),
    });
  }

  function addService() {
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
    const service = preset.create(makeId, uniqueName(preset.name, names));
    update({ ...project, services: [...project.services, service] });
    // Open the new service and move to its name, so it can be named straight away.
    requestAnimationFrame(() => document.getElementById(`svc-${service.id}-name`)?.focus());
  }

  function loadTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id) ?? DEFAULT_TEMPLATE;
    setProject({ name: project.name, services: t.create(makeId) });
    setLoadedTemplate(t.id);
    setTemplateId(t.id);
    setDirty(false);
    setPendingTemplate(null);
  }

  function requestTemplate(id: string) {
    if (dirty) setPendingTemplate(id);
    else loadTemplate(id);
  }

  const download =
    showing === "env"
      ? { filename: ".env.example", mimeType: "text/plain" }
      : { filename: "compose.yaml", mimeType: "application/yaml" };

  return (
    <>
      <InputPanel label="Services">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Start from" htmlFor="compose-template">
              <Select id="compose-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={() => requestTemplate(templateId)}>Load template</Button>
          </div>
          {template && !dirty && <p className="-mt-3 text-xs text-[color:var(--text-muted)]">{template.note}</p>}

          <Field label="Project name" htmlFor="compose-name" help="Optional. Compose uses the folder name when it's blank.">
            <CodeInput
              id="compose-name"
              value={project.name}
              onChange={(e) => update({ ...project, name: e.target.value })}
              placeholder="my-app"
              invalid={issues.some((i) => !i.serviceId && i.message.startsWith("The project name"))}
            />
          </Field>

          <ol className="space-y-3">
            {project.services.map((s, i) => {
              const own = issues.filter((issue) => issue.serviceId === s.id);
              const ownErrors = own.filter((issue) => issue.level === "error").length;
              return (
                <li key={s.id}>
                  <details open className="group rounded-md border border-[color:var(--border)]">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                      <ChevronDown aria-hidden className="h-4 w-4 shrink-0 -rotate-90 text-[color:var(--text-muted)] transition-transform group-open:rotate-0" />
                      <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-sm">{s.name.trim() || `Service ${i + 1}`}</span>
                      {own.length > 0 && (
                        <span className={`text-xs ${ownErrors ? "text-[color:var(--error)]" : "text-[color:var(--accent-warn-text)]"}`}>
                          {ownErrors ? `${ownErrors} ${ownErrors === 1 ? "error" : "errors"}` : `${own.length} ${own.length === 1 ? "warning" : "warnings"}`}
                        </span>
                      )}
                    </summary>
                    <div className="border-t border-[color:var(--border)] p-3">
                      <ServiceEditor service={s} serviceNames={names} issues={own} makeId={makeId} onChange={updateService} />
                      <div className="mt-5 flex justify-end">
                        <Button size="sm" icon={Trash2} onClick={() => removeService(s.id)}>
                          Remove {s.name.trim() || `service ${i + 1}`}
                        </Button>
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Add a service" htmlFor="compose-preset">
              <Select id="compose-preset" value={presetId} onChange={(e) => setPresetId(e.target.value)} className="w-48">
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button icon={Plus} onClick={addService}>
              Add service
            </Button>
            <Button onClick={() => requestTemplate(DEFAULT_TEMPLATE.id)} disabled={!dirty && loadedTemplate === DEFAULT_TEMPLATE.id}>
              Reset
            </Button>
          </div>
        </div>
      </InputPanel>

      <OutputPanel label={showing === "env" ? ".env.example" : "compose.yaml"} copyText={showing === "env" ? env.text : yaml} outputType={showing === "env" ? "env" : "yaml"} download={download}>
        <div className="space-y-5">
          <section aria-labelledby="compose-checks" className="font-[family-name:var(--font-ui)]">
            <h2 id="compose-checks" className="mb-1 flex items-center gap-2 text-sm font-semibold">
              {issues.length === 0 ? (
                <>
                  <CheckCircle2 aria-hidden className="h-4 w-4 text-[color:var(--accent-text)]" /> Local checks passed
                </>
              ) : (
                <>
                  <IssueIcon level={errors ? "error" : "warning"} />
                  {[errors && `${errors} ${errors === 1 ? "error" : "errors"}`, issues.length - errors && `${issues.length - errors} ${issues.length - errors === 1 ? "warning" : "warnings"}`]
                    .filter(Boolean)
                    .join(", ")}
                </>
              )}
            </h2>
            <p className="mb-2 text-xs text-[color:var(--text-muted)]">
              Checked here in your browser, not by Docker. Run <code className="font-[family-name:var(--font-mono)]">docker compose config</code> next to the file for
              Docker&rsquo;s own validation.
            </p>
            {issues.length > 0 && (
              <ul className="space-y-1.5 text-xs">
                {issues.map((issue, i) => (
                  <li key={`${issue.serviceId}-${i}`} className="flex gap-2">
                    <IssueIcon level={issue.level} />
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {env.text && <SegmentedControl label="File" options={OUTPUTS} value={showing} onChange={setOutput} />}

          {showing === "env" ? (
            <>
              <CodeBlock code={env.text} />
              <div className="space-y-2 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                <p>
                  compose.yaml reads {env.keys.length === 1 ? "this secret" : `these ${env.keys.length} secrets`} as $&#123;NAME&#125;. Docker Compose fills them in from a
                  file called <code>.env</code> next to compose.yaml.
                </p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>
                    Commit <code>.env.example</code>; it only holds placeholders.
                  </li>
                  <li>
                    Copy it to <code>.env</code> and put the real values there.
                  </li>
                  <li>
                    Add <code>.env</code> to <code>.gitignore</code> so the secrets never reach version control.
                  </li>
                </ol>
              </div>
            </>
          ) : (
            <>
              <CodeBlock code={yaml} />
              {env.text && (
                <div className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-ui)] text-xs text-[color:var(--text-muted)]">
                  Uses {env.keys.length === 1 ? "1 secret" : `${env.keys.length} secrets`} from .env.
                  <DownloadButton content={env.text} filename=".env.example" mimeType="text/plain" />
                </div>
              )}
            </>
          )}
        </div>
      </OutputPanel>

      <Dialog open={pendingTemplate !== null} onClose={() => setPendingTemplate(null)} title="Replace your services?" description="Loading a template replaces the services you've edited.">
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setPendingTemplate(null)}>Keep editing</Button>
          <Button variant="primary" onClick={() => pendingTemplate && loadTemplate(pendingTemplate)}>
            Replace
          </Button>
        </div>
      </Dialog>
    </>
  );
}
