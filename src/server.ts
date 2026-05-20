import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  createXctraceClient,
  type ExportTableOptions,
  type ExportTocOptions,
  type RecordTraceOptions,
  type XctraceClient
} from "./xctrace.js";

export interface ServerOptions {
  xctraceClient?: XctraceClient;
}

const sectionsSchema = z.record(z.string(), z.array(z.string()));
const commandResultSchema = z.object({
  xml: z.string(),
  outputPath: z.string().optional(),
  stderr: z.string(),
  args: z.array(z.string())
});
const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all-processes") }),
  z.object({ kind: z.literal("attach"), process: z.union([z.string(), z.number()]) }),
  z.object({ kind: z.literal("launch"), command: z.string(), args: z.array(z.string()).optional() })
]);
const recordInputSchema = {
  template: z.string().optional(),
  instruments: z.array(z.string()).optional(),
  device: z.string().optional(),
  outputPath: z.string().optional(),
  appendRun: z.boolean().optional(),
  runName: z.string().optional(),
  timeLimit: z.string().optional(),
  window: z.string().optional(),
  packagePath: z.string().optional(),
  target: targetSchema,
  env: z.record(z.string(), z.string()).optional(),
  targetStdin: z.string().optional(),
  targetStdout: z.string().optional(),
  notifyTracingStarted: z.string().optional(),
  noPrompt: z.boolean().optional()
};

export function createServer(options: ServerOptions = {}): McpServer {
  const xctraceClient = options.xctraceClient ?? createXctraceClient();
  const server = new McpServer({
    name: "xctrace-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "xctrace_version",
    {
      title: "xctrace version",
      description: "Return the installed xcrun xctrace version.",
      outputSchema: {
        raw: z.string().describe("Raw xctrace version output."),
        version: z.string().nullable().describe("Parsed xctrace version number, when available."),
        build: z.string().nullable().describe("Parsed xctrace build identifier, when available.")
      }
    },
    async () => {
      const structuredContent = await xctraceClient.version();

      return {
        content: [
          {
            type: "text",
            text: `xctrace ${structuredContent.version ?? "unknown"} (${structuredContent.build ?? "unknown build"})`
          }
        ],
        structuredContent
      };
    }
  );

  server.registerTool(
    "list_xctrace_capabilities",
    {
      title: "List xctrace capabilities",
      description: "List installed xctrace devices, simulators, templates, and instruments.",
      outputSchema: {
        devices: sectionsSchema,
        templates: sectionsSchema,
        instruments: sectionsSchema
      }
    },
    async () => {
      const structuredContent = await xctraceClient.listCapabilities();
      return toolResult("Available xctrace devices, templates, and instruments.", structuredContent);
    }
  );

  server.registerTool(
    "record_trace",
    {
      title: "Record trace",
      description: "Record a new Instruments trace with xcrun xctrace record.",
      inputSchema: recordInputSchema,
      outputSchema: {
        tracePath: z.string().nullable(),
        stdout: z.string(),
        stderr: z.string(),
        args: z.array(z.string())
      }
    },
    async input => {
      const structuredContent = await xctraceClient.record(input as RecordTraceOptions);
      return toolResult(`Trace recorded${structuredContent.tracePath ? ` at ${structuredContent.tracePath}` : ""}.`, structuredContent);
    }
  );

  server.registerTool(
    "export_trace_toc",
    {
      title: "Export trace TOC",
      description: "Export a trace table of contents with xcrun xctrace export --toc.",
      inputSchema: {
        inputPath: z.string(),
        outputPath: z.string().optional()
      },
      outputSchema: commandResultSchema.shape
    },
    async input => {
      const structuredContent = await xctraceClient.exportToc(input as ExportTocOptions);
      return toolResult(`Exported TOC for ${input.inputPath}.`, structuredContent);
    }
  );

  server.registerTool(
    "export_trace_table",
    {
      title: "Export trace table",
      description: "Export a selected trace table with xcrun xctrace export --xpath.",
      inputSchema: {
        inputPath: z.string(),
        xpath: z.string(),
        outputPath: z.string().optional()
      },
      outputSchema: commandResultSchema.shape
    },
    async input => {
      const structuredContent = await xctraceClient.exportTable(input as ExportTableOptions);
      return toolResult(`Exported trace table for ${input.xpath}.`, structuredContent);
    }
  );

  server.registerTool(
    "analyze_trace",
    {
      title: "Analyze trace",
      description: "Analyze a trace TOC and return Markdown, structured findings, metrics, and suggested table exports.",
      inputSchema: {
        inputPath: z.string()
      },
      outputSchema: {
        markdown: z.string(),
        findings: z.array(
          z.object({
            severity: z.enum(["info", "warning"]),
            title: z.string(),
            detail: z.string()
          })
        ),
        metrics: z.record(z.string(), z.union([z.number(), z.string()])),
        artifacts: z.array(
          z.object({
            title: z.string(),
            run: z.number(),
            schema: z.string(),
            xpath: z.string()
          })
        )
      }
    },
    async input => {
      const structuredContent = await xctraceClient.analyze(input.inputPath);
      return toolResult(structuredContent.markdown, structuredContent);
    }
  );

  return server;
}

function toolResult<T extends object>(text: string, structuredContent: T) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: structuredContent as Record<string, unknown>
  };
}
