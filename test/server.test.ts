import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import type { XctraceClient } from "../src/xctrace.js";

async function connectTestClient(xctraceClient: XctraceClient): Promise<Client> {
  const server = createServer({ xctraceClient });
  const client = new Client({ name: "xctrace-mcp-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("createServer", () => {
  it("registers the xctrace MCP tools", async () => {
    const client = await connectTestClient(fakeClient());
    const tools = await client.listTools();

    assert.deepEqual(
      tools.tools.map(tool => tool.name).sort(),
      [
        "analyze_trace",
        "export_trace_table",
        "export_trace_toc",
        "list_xctrace_capabilities",
        "record_trace",
        "xctrace_version"
      ]
    );
  });

  it("returns structured capability data", async () => {
    const client = await connectTestClient(fakeClient());
    const result = await client.callTool({
      name: "list_xctrace_capabilities",
      arguments: {}
    });

    assert.deepEqual(result.structuredContent, {
      devices: { Simulators: ["iPhone 17 Pro (SIM-UDID)"] },
      templates: { "Standard Templates": ["Time Profiler"] },
      instruments: { "Standard Instruments": ["SwiftUI"] }
    });
  });
});

function fakeClient(): XctraceClient {
  return {
    async version() {
      return { raw: "xctrace version 16.0 (17E202)", version: "16.0", build: "17E202" };
    },
    async list() {
      return {};
    },
    async listCapabilities() {
      return {
        devices: { Simulators: ["iPhone 17 Pro (SIM-UDID)"] },
        templates: { "Standard Templates": ["Time Profiler"] },
        instruments: { "Standard Instruments": ["SwiftUI"] }
      };
    },
    async record() {
      return { tracePath: "/tmp/run.trace", stdout: "", stderr: "", args: [] };
    },
    async exportToc() {
      return { xml: "<trace-toc/>", stderr: "", args: [] };
    },
    async exportTable() {
      return { xml: "<row/>", stderr: "", args: [] };
    },
    async analyze() {
      return {
        markdown: "# xctrace Analysis",
        findings: [],
        metrics: { runCount: 0 },
        artifacts: []
      };
    }
  };
}
