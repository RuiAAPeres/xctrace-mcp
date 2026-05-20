import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeTraceToc,
  buildExportTableArgs,
  buildExportTocArgs,
  buildRecordArgs,
  createXctraceClient,
  parseListOutput,
  parseRecordOutput,
  parseTraceToc,
  parseXctraceVersion
} from "../src/xctrace.js";

describe("parseXctraceVersion", () => {
  it("parses version and build from standard xctrace output", () => {
    assert.deepEqual(parseXctraceVersion("xctrace version 16.0 (17E202)\n"), {
      raw: "xctrace version 16.0 (17E202)",
      version: "16.0",
      build: "17E202"
    });
  });

  it("keeps raw output when the format changes", () => {
    assert.deepEqual(parseXctraceVersion("unexpected output\n"), {
      raw: "unexpected output",
      version: null,
      build: null
    });
  });
});

describe("parseListOutput", () => {
  it("parses named sections from xctrace list output", () => {
    assert.deepEqual(
      parseListOutput(`
== Standard Templates ==
Time Profiler
SwiftUI

== Devices ==
Rui's Mac (MAC-UDID)

== Simulators ==
iPhone 17 Pro (26.4.1) (SIM-UDID)
`),
      {
        "Standard Templates": ["Time Profiler", "SwiftUI"],
        Devices: ["Rui's Mac (MAC-UDID)"],
        Simulators: ["iPhone 17 Pro (26.4.1) (SIM-UDID)"]
      }
    );
  });
});

describe("buildRecordArgs", () => {
  it("builds a record command for all processes", () => {
    assert.deepEqual(
      buildRecordArgs({
        template: "Time Profiler",
        target: { kind: "all-processes" },
        timeLimit: "5s",
        outputPath: "/tmp/run.trace",
        noPrompt: true
      }),
      [
        "xctrace",
        "record",
        "--template",
        "Time Profiler",
        "--output",
        "/tmp/run.trace",
        "--time-limit",
        "5s",
        "--no-prompt",
        "--all-processes"
      ]
    );
  });

  it("builds a launch command with environment and arguments after --launch --", () => {
    assert.deepEqual(
      buildRecordArgs({
        template: "Allocations",
        target: {
          kind: "launch",
          command: "/tmp/MyApp.app",
          args: ["--uitest"]
        },
        env: { A: "1", B: "two" },
        targetStdout: "-",
        outputPath: "/tmp/alloc.trace"
      }),
      [
        "xctrace",
        "record",
        "--template",
        "Allocations",
        "--output",
        "/tmp/alloc.trace",
        "--target-stdout",
        "-",
        "--env",
        "A=1",
        "--env",
        "B=two",
        "--launch",
        "--",
        "/tmp/MyApp.app",
        "--uitest"
      ]
    );
  });
});

describe("export argument builders", () => {
  it("builds TOC export args", () => {
    assert.deepEqual(buildExportTocArgs({ inputPath: "/tmp/run.trace" }), [
      "xctrace",
      "export",
      "--input",
      "/tmp/run.trace",
      "--toc"
    ]);
  });

  it("builds XPath table export args", () => {
    assert.deepEqual(
      buildExportTableArgs({
        inputPath: "/tmp/run.trace",
        xpath: "/trace-toc/run[@number=\"1\"]/data/table[@schema=\"time-profile\"]",
        outputPath: "/tmp/time-profile.xml"
      }),
      [
        "xctrace",
        "export",
        "--input",
        "/tmp/run.trace",
        "--output",
        "/tmp/time-profile.xml",
        "--xpath",
        "/trace-toc/run[@number=\"1\"]/data/table[@schema=\"time-profile\"]"
      ]
    );
  });
});

describe("parseRecordOutput", () => {
  it("extracts the saved trace path", () => {
    assert.equal(
      parseRecordOutput("Recording completed. Saving output file...\nOutput file saved as: /tmp/run.trace\n"),
      "/tmp/run.trace"
    );
  });
});

describe("parseTraceToc", () => {
  it("normalizes run summary, processes, and tables from xctrace TOC XML", () => {
    const toc = parseTraceToc(`
<?xml version="1.0"?>
<trace-toc>
  <run number="1">
    <info>
      <target>
        <device platform="macOS" model="MacBook Pro" name="Rui's Mac" os-version="26.4.1" uuid="MAC-UDID"/>
        <all-processes/>
      </target>
      <summary>
        <start-date>2026-05-20T17:07:42.299+01:00</start-date>
        <end-date>2026-05-20T17:07:44.162+01:00</end-date>
        <duration>1.862984</duration>
        <end-reason>Time limit reached</end-reason>
        <instruments-version>16.0 (17E202)</instruments-version>
        <template-name>Time Profiler</template-name>
      </summary>
    </info>
    <processes>
      <process name="Dash" pid="50829" path="/tmp/Dash.app/Dash"/>
    </processes>
    <data>
      <table schema="time-profile" target-pid="ALL" documentation="CPU profile"/>
      <table schema="time-sample" target="ALL" sample-rate-micro-seconds="1000"/>
    </data>
  </run>
</trace-toc>
`);

    assert.deepEqual(toc.runs[0]?.summary, {
      startDate: "2026-05-20T17:07:42.299+01:00",
      endDate: "2026-05-20T17:07:44.162+01:00",
      durationSeconds: 1.862984,
      endReason: "Time limit reached",
      instrumentsVersion: "16.0 (17E202)",
      templateName: "Time Profiler"
    });
    assert.deepEqual(toc.runs[0]?.processes, [
      { name: "Dash", pid: 50829, path: "/tmp/Dash.app/Dash" }
    ]);
    assert.deepEqual(toc.runs[0]?.tables.map(table => table.schema), ["time-profile", "time-sample"]);
  });
});

describe("analyzeTraceToc", () => {
  it("returns Markdown plus structured findings for a supported template", () => {
    const report = analyzeTraceToc({
      runs: [
        {
          number: 1,
          summary: {
            durationSeconds: 1.2,
            templateName: "Time Profiler"
          },
          target: {
            device: { platform: "macOS", name: "Rui's Mac" },
            mode: "all-processes"
          },
          processes: [{ name: "Dash", pid: 10, path: "/tmp/Dash" }],
          tables: [
            { schema: "time-profile", attributes: { schema: "time-profile" } },
            { schema: "time-sample", attributes: { schema: "time-sample" } }
          ]
        }
      ]
    });

    assert.match(report.markdown, /Time Profiler/);
    assert.equal(report.metrics.runCount, 1);
    assert.equal(report.findings[0]?.severity, "info");
    assert.equal(report.artifacts[0]?.xpath, '/trace-toc/run[@number="1"]/data/table[@schema="time-profile"]');
  });
});

describe("createXctraceClient", () => {
  it("runs list, record, and export commands through the injected runner", async () => {
    const calls: string[][] = [];
    const client = createXctraceClient({
      run: async args => {
        calls.push(args);
        if (args.includes("list")) {
          return { stdout: "== Standard Templates ==\nTime Profiler\n", stderr: "" };
        }
        if (args.includes("record")) {
          return { stdout: "Output file saved as: /tmp/run.trace\n", stderr: "" };
        }
        return { stdout: "<trace-toc><run number=\"1\"/></trace-toc>", stderr: "" };
      }
    });

    assert.deepEqual(await client.list("templates"), {
      "Standard Templates": ["Time Profiler"]
    });
    assert.equal(
      (
        await client.record({
          template: "Time Profiler",
          target: { kind: "all-processes" },
          outputPath: "/tmp/run.trace"
        })
      ).tracePath,
      "/tmp/run.trace"
    );
    assert.equal((await client.exportToc({ inputPath: "/tmp/run.trace" })).xml, "<trace-toc><run number=\"1\"/></trace-toc>");
    assert.equal(calls.length, 3);
  });

  it("returns the requested output path when xctrace only prints a basename", async () => {
    const client = createXctraceClient({
      run: async () => ({ stdout: "Output file saved as: run.trace\n", stderr: "" })
    });

    const result = await client.record({
      template: "Time Profiler",
      target: { kind: "all-processes" },
      outputPath: "/tmp/run.trace"
    });

    assert.equal(result.tracePath, "/tmp/run.trace");
  });

  it("creates a deterministic temp output path when the caller omits outputPath", async () => {
    let ensuredDirectory: string | undefined;
    let recordedArgs: string[] = [];
    const client = createXctraceClient({
      outputDirectory: "/tmp/xctrace-mcp-test",
      now: () => new Date("2026-05-20T17:30:00.000Z"),
      ensureDirectory: directory => {
        ensuredDirectory = directory;
      },
      run: async args => {
        recordedArgs = args;
        return { stdout: "Output file saved as: time-profiler-2026.trace\n", stderr: "" };
      }
    });

    const result = await client.record({
      template: "Time Profiler",
      target: { kind: "all-processes" }
    });

    assert.equal(ensuredDirectory, "/tmp/xctrace-mcp-test");
    assert.equal(result.tracePath, "/tmp/xctrace-mcp-test/time-profiler-2026-05-20T17-30-00-000Z.trace");
    assert.deepEqual(recordedArgs.slice(0, 6), [
      "xctrace",
      "record",
      "--template",
      "Time Profiler",
      "--output",
      "/tmp/xctrace-mcp-test/time-profiler-2026-05-20T17-30-00-000Z.trace"
    ]);
  });
});
