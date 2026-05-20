# xctrace-mcp

`xctrace-mcp` is an MCP server for recording and analyzing Xcode Instruments traces through Apple's `xcrun xctrace` command-line tool.

The goal is to make the normal Xcode app-performance loop available to coding agents: record a trace, export the useful tables, summarize the evidence, and keep the raw artifacts available for deeper inspection.

## Status

Early but usable. The package can list local `xctrace` capabilities, record traces, export TOCs/tables, and produce a first-pass TOC-based analysis report.

## Install

```bash
npx -y xctrace-mcp
```

The package requires macOS with Xcode command-line tools available:

```bash
xcrun xctrace version
```

## MCP Tools

- `xctrace_version`: return the installed `xcrun xctrace` version.
- `list_xctrace_capabilities`: list installed devices, simulators, templates, and instruments.
- `record_trace`: record a trace with `xcrun xctrace record`.
- `export_trace_toc`: export a trace table of contents with `xcrun xctrace export --toc`.
- `export_trace_table`: export a selected trace table with `xcrun xctrace export --xpath`.
- `analyze_trace`: return Markdown, structured findings, metrics, and suggested table XPath exports from a trace TOC.

## Example Tool Arguments

Record all processes for five seconds:

```json
{
  "template": "Time Profiler",
  "target": { "kind": "all-processes" },
  "timeLimit": "5s",
  "outputPath": "/tmp/profile.trace",
  "noPrompt": true
}
```

Export the TOC:

```json
{
  "inputPath": "/tmp/profile.trace"
}
```

Export a suggested table:

```json
{
  "inputPath": "/tmp/profile.trace",
  "xpath": "/trace-toc/run[@number=\"1\"]/data/table[@schema=\"time-profile\"]"
}
```

## V1 Analyzer Scope

The first analyzer set is TOC-based and aimed at app developers. It identifies useful tables and emits XPath suggestions for:

- Time Profiler
- App Launch
- SwiftUI
- Animation Hitches
- Allocations

V1 will officially support simulator apps and host Mac processes. Physical device profiling may work through `xctrace`, but it is experimental until the permission and device-state edge cases are handled carefully.

## Local Development

```bash
npm install
npm run typecheck
npm run build
npm test
```

Run the server locally:

```bash
npm run build
node dist/src/index.js
```

## MCP Client Configuration

Example stdio configuration:

```json
{
  "mcpServers": {
    "xctrace": {
      "command": "npx",
      "args": ["-y", "xctrace-mcp"]
    }
  }
}
```
