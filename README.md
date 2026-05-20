# xctrace-mcp

`xctrace-mcp` is an MCP server for recording and analyzing Xcode Instruments traces through Apple's `xcrun xctrace` command-line tool.

The goal is to make the normal Xcode app-performance loop available to coding agents: record a trace, export the useful tables, summarize the evidence, and keep the raw artifacts available for deeper inspection.

## Status

Early scaffold. The initial package exposes a small health/version tool while the recording, export, and analyzer tools are built out.

## Install

```bash
npx -y xctrace-mcp
```

The package requires macOS with Xcode command-line tools available:

```bash
xcrun xctrace version
```

## Planned MCP Tools

- `list_xctrace_capabilities`: list installed devices, simulators, templates, and instruments.
- `record_trace`: record a trace with `xcrun xctrace record`.
- `export_trace_toc`: export a trace table of contents.
- `export_trace_table`: export a selected trace table by XPath/schema.
- `analyze_trace`: return Markdown and JSON findings for supported templates.

## V1 Analyzer Scope

The first supported analyzer set is aimed at app developers:

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
