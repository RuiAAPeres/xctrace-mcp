import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { getXctraceVersion } from "./xctrace.js";

export function createServer(): McpServer {
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
      const structuredContent = await getXctraceVersion();

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

  return server;
}
