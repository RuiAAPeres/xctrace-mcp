import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";

export interface XctraceVersion extends Record<string, string | null> {
  raw: string;
  version: string | null;
  build: string | null;
}

export type ListKind = "devices" | "templates" | "instruments";

export type XctraceListSections = Record<string, string[]>;

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (args: string[]) => Promise<CommandResult>;

export interface XctraceClientOptions {
  run?: CommandRunner;
  outputDirectory?: string;
  now?: () => Date;
  ensureDirectory?: (directory: string) => void;
}

export type RecordTarget =
  | { kind: "all-processes" }
  | { kind: "attach"; process: string | number }
  | { kind: "launch"; command: string; args?: string[] };

export interface RecordTraceOptions {
  template?: string;
  instruments?: string[];
  device?: string;
  outputPath?: string;
  appendRun?: boolean;
  runName?: string;
  timeLimit?: string;
  window?: string;
  packagePath?: string;
  target: RecordTarget;
  env?: Record<string, string>;
  targetStdin?: string;
  targetStdout?: string;
  notifyTracingStarted?: string;
  noPrompt?: boolean;
}

export interface ExportTocOptions {
  inputPath: string;
  outputPath?: string;
}

export interface ExportTableOptions {
  inputPath: string;
  xpath: string;
  outputPath?: string;
}

export interface RecordTraceResult {
  tracePath: string | null;
  stdout: string;
  stderr: string;
  args: string[];
}

export interface ExportResult {
  xml: string;
  outputPath?: string;
  stderr: string;
  args: string[];
}

export interface TraceToc {
  runs: TraceRun[];
}

export interface TraceRun {
  number: number;
  summary: TraceRunSummary;
  target: TraceTarget;
  processes: TraceProcess[];
  tables: TraceTable[];
}

export interface TraceRunSummary {
  startDate?: string;
  endDate?: string;
  durationSeconds?: number;
  endReason?: string;
  instrumentsVersion?: string;
  templateName?: string;
  recordingMode?: string;
  timeLimit?: string;
}

export interface TraceTarget {
  device?: Record<string, string>;
  mode?: "all-processes" | "attach" | "launch" | "unknown";
}

export interface TraceProcess {
  name?: string;
  pid?: number;
  path?: string;
}

export interface TraceTable {
  schema: string;
  category?: string;
  documentation?: string;
  attributes: Record<string, string>;
}

export interface TraceAnalysisReport {
  markdown: string;
  findings: TraceFinding[];
  metrics: Record<string, number | string>;
  artifacts: TraceArtifact[];
}

export interface TraceFinding {
  severity: "info" | "warning";
  title: string;
  detail: string;
}

export interface TraceArtifact {
  title: string;
  run: number;
  schema: string;
  xpath: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
  trimValues: true
});

const interestingSchemasByTemplate: Record<string, string[]> = {
  "Time Profiler": ["time-profile", "time-sample", "process-info", "thread-info"],
  "App Launch": ["life-cycle-period", "app-launch", "process-info", "os-signpost"],
  SwiftUI: ["swiftui", "view-body", "view-properties", "time-profile", "os-signpost"],
  "Animation Hitches": ["potential-hangs", "hang-risks", "time-profile", "os-signpost"],
  Allocations: ["allocation", "vm-regions", "process-info", "heap-allocation"]
};

export function parseXctraceVersion(output: string): XctraceVersion {
  const raw = output.trim();
  const match = raw.match(/^xctrace version\s+([^\s]+)(?:\s+\(([^)]+)\))?$/);

  return {
    raw,
    version: match?.[1] ?? null,
    build: match?.[2] ?? null
  };
}

export function parseListOutput(output: string): XctraceListSections {
  const sections: XctraceListSections = {};
  let currentSection: string | undefined;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const heading = line.match(/^==\s+(.+?)\s+==$/);
    if (heading) {
      currentSection = heading[1];
      sections[currentSection] = [];
      continue;
    }

    if (currentSection) {
      sections[currentSection]?.push(line);
    }
  }

  return sections;
}

export function buildRecordArgs(options: RecordTraceOptions): string[] {
  const args = ["xctrace", "record"];

  if (options.template) {
    args.push("--template", options.template);
  }
  for (const instrument of options.instruments ?? []) {
    args.push("--instrument", instrument);
  }
  pushOptional(args, "--device", options.device);
  pushOptional(args, "--output", options.outputPath);
  if (options.appendRun) {
    args.push("--append-run");
  }
  pushOptional(args, "--run-name", options.runName);
  pushOptional(args, "--time-limit", options.timeLimit);
  pushOptional(args, "--window", options.window);
  pushOptional(args, "--package", options.packagePath);
  pushOptional(args, "--target-stdin", options.targetStdin);
  pushOptional(args, "--target-stdout", options.targetStdout);

  for (const [key, value] of Object.entries(options.env ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    args.push("--env", `${key}=${value}`);
  }

  pushOptional(args, "--notify-tracing-started", options.notifyTracingStarted);
  if (options.noPrompt) {
    args.push("--no-prompt");
  }

  switch (options.target.kind) {
    case "all-processes":
      args.push("--all-processes");
      break;
    case "attach":
      args.push("--attach", String(options.target.process));
      break;
    case "launch":
      args.push("--launch", "--", options.target.command, ...(options.target.args ?? []));
      break;
  }

  return args;
}

export function buildExportTocArgs(options: ExportTocOptions): string[] {
  const args = ["xctrace", "export", "--input", options.inputPath];
  pushOptional(args, "--output", options.outputPath);
  args.push("--toc");
  return args;
}

export function buildExportTableArgs(options: ExportTableOptions): string[] {
  const args = ["xctrace", "export", "--input", options.inputPath];
  pushOptional(args, "--output", options.outputPath);
  args.push("--xpath", options.xpath);
  return args;
}

export function parseRecordOutput(output: string): string | null {
  return output.match(/Output file saved as:\s*(.+)$/m)?.[1]?.trim() ?? null;
}

export function parseTraceToc(xml: string): TraceToc {
  const root = parser.parse(xml) as { "trace-toc"?: { run?: unknown } };
  const runs = toArray(root["trace-toc"]?.run).map(parseRun);

  return { runs };
}

export function analyzeTraceToc(toc: TraceToc): TraceAnalysisReport {
  const artifacts: TraceArtifact[] = [];
  const findings: TraceFinding[] = [];
  const lines = ["# xctrace Analysis", ""];

  for (const run of toc.runs) {
    const templateName = run.summary.templateName ?? "Unknown template";
    const supportedSchemas = interestingSchemasByTemplate[templateName] ?? [];
    const tableSchemas = new Set(run.tables.map(table => table.schema));
    const matchingSchemas = supportedSchemas.filter(schema => tableSchemas.has(schema));

    lines.push(`## Run ${run.number}: ${templateName}`);
    if (run.summary.durationSeconds !== undefined) {
      lines.push(`Duration: ${run.summary.durationSeconds}s`);
    }
    if (run.target.device?.name) {
      lines.push(`Target: ${run.target.device.name}${run.target.device.platform ? ` (${run.target.device.platform})` : ""}`);
    }
    lines.push(`Processes captured: ${run.processes.length}`);
    lines.push(`Tables available: ${run.tables.length}`);

    if (matchingSchemas.length > 0) {
      findings.push({
        severity: "info",
        title: `${templateName} trace has analyzable tables`,
        detail: `Found ${matchingSchemas.join(", ")}. Export these tables for deeper analysis.`
      });
      lines.push(`Suggested exports: ${matchingSchemas.join(", ")}`);
    } else {
      findings.push({
        severity: "warning",
        title: `${templateName} trace has no recognized v1 analyzer tables`,
        detail: "Use export_trace_toc to inspect available schemas, then export_trace_table with the schema XPath you need."
      });
      lines.push("Suggested exports: inspect the TOC for available table schemas.");
    }
    lines.push("");

    const exportedSchemas = matchingSchemas.length > 0 ? matchingSchemas : run.tables.slice(0, 5).map(table => table.schema);
    for (const schema of exportedSchemas) {
      artifacts.push({
        title: `${templateName}: ${schema}`,
        run: run.number,
        schema,
        xpath: tableXPath(run.number, schema)
      });
    }
  }

  return {
    markdown: lines.join("\n").trimEnd(),
    findings,
    metrics: {
      runCount: toc.runs.length,
      tableCount: toc.runs.reduce((sum, run) => sum + run.tables.length, 0),
      processCount: toc.runs.reduce((sum, run) => sum + run.processes.length, 0)
    },
    artifacts
  };
}

export function createXctraceClient(options: XctraceClientOptions = {}) {
  const run = options.run ?? runXctrace;
  const outputDirectory = options.outputDirectory ?? join(tmpdir(), "xctrace-mcp");
  const now = options.now ?? (() => new Date());
  const ensureDirectory = options.ensureDirectory ?? ((directory: string) => mkdirSync(directory, { recursive: true }));

  return {
    async version(): Promise<XctraceVersion> {
      const { stdout } = await run(["xctrace", "version"]);
      return parseXctraceVersion(stdout);
    },

    async list(kind: ListKind): Promise<XctraceListSections> {
      const { stdout } = await run(["xctrace", "list", kind]);
      return parseListOutput(stdout);
    },

    async listCapabilities(): Promise<{
      devices: XctraceListSections;
      templates: XctraceListSections;
      instruments: XctraceListSections;
    }> {
      const [devices, templates, instruments] = await Promise.all([
        this.list("devices"),
        this.list("templates"),
        this.list("instruments")
      ]);

      return { devices, templates, instruments };
    },

    async record(options: RecordTraceOptions): Promise<RecordTraceResult> {
      const resolvedOptions = {
        ...options,
        outputPath: options.outputPath ?? defaultTracePath(outputDirectory, options.template, now())
      };
      ensureDirectory(outputDirectory);
      const args = buildRecordArgs(resolvedOptions);
      const { stdout, stderr } = await run(args);

      return {
        tracePath: resolvedOptions.outputPath ?? parseRecordOutput(stdout),
        stdout,
        stderr,
        args
      };
    },

    async exportToc(options: ExportTocOptions): Promise<ExportResult> {
      const args = buildExportTocArgs(options);
      const { stdout, stderr } = await run(args);

      return {
        xml: stdout,
        outputPath: options.outputPath,
        stderr,
        args
      };
    },

    async exportTable(options: ExportTableOptions): Promise<ExportResult> {
      const args = buildExportTableArgs(options);
      const { stdout, stderr } = await run(args);

      return {
        xml: stdout,
        outputPath: options.outputPath,
        stderr,
        args
      };
    },

    async analyze(inputPath: string): Promise<TraceAnalysisReport> {
      const exported = await this.exportToc({ inputPath });
      return analyzeTraceToc(parseTraceToc(exported.xml));
    }
  };
}

export type XctraceClient = ReturnType<typeof createXctraceClient>;

export async function getXctraceVersion(): Promise<XctraceVersion> {
  return createXctraceClient().version();
}

async function runXctrace(args: string[]): Promise<CommandResult> {
  if (args.length === 0) {
    throw new Error("Cannot run an empty xctrace command.");
  }

  return new Promise((resolve, reject) => {
    execFile(
      "xcrun",
      args,
      {
        timeout: 30 * 60_000,
        maxBuffer: 64 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${args.join(" ")} failed: ${error.message}\n${stderr}`.trim()));
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
}

function parseRun(value: unknown): TraceRun {
  const run = objectValue(value);
  const summary = objectValue(objectValue(run.info).summary);
  const target = objectValue(objectValue(run.info).target);

  return {
    number: numberValue(run.number) ?? 0,
    summary: compactObject({
      startDate: stringValue(summary["start-date"]),
      endDate: stringValue(summary["end-date"]),
      durationSeconds: numberValue(summary.duration),
      endReason: stringValue(summary["end-reason"]),
      instrumentsVersion: stringValue(summary["instruments-version"]),
      templateName: stringValue(summary["template-name"]),
      recordingMode: stringValue(summary["recording-mode"]),
      timeLimit: stringValue(summary["time-limit"])
    }),
    target: compactObject({
      device: attributesValue(target.device),
      mode: targetMode(target)
    }),
    processes: toArray(objectValue(run.processes).process).map(process => {
      const item = objectValue(process);
      return {
        name: stringValue(item.name),
        pid: numberValue(item.pid),
        path: stringValue(item.path)
      };
    }),
    tables: toArray(objectValue(run.data).table)
      .map(table => {
        const item = attributesValue(table);
        return {
          schema: item.schema ?? "",
          category: item.category,
          documentation: item.documentation,
          attributes: item
        };
      })
      .filter(table => table.schema.length > 0)
  };
}

function targetMode(target: Record<string, unknown>): TraceTarget["mode"] {
  if ("all-processes" in target) {
    return "all-processes";
  }
  if ("process" in target) {
    return "attach";
  }
  if ("launch" in target) {
    return "launch";
  }
  return "unknown";
}

function tableXPath(runNumber: number, schema: string): string {
  return `/trace-toc/run[@number="${runNumber}"]/data/table[@schema="${schema}"]`;
}

function pushOptional(args: string[], flag: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) {
    args.push(flag, value);
  }
}

function defaultTracePath(outputDirectory: string, template: string | undefined, date: Date): string {
  const templateSlug = (template ?? "trace")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const timestamp = date.toISOString().replace(/[:.]/g, "-");
  return join(outputDirectory, `${templateSlug || "trace"}-${timestamp}.trace`);
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function attributesValue(value: unknown): Record<string, string> {
  const object = objectValue(value);
  const attributes: Record<string, string> = {};
  for (const [key, item] of Object.entries(object)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      attributes[key] = String(item);
    }
  }
  return attributes;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
