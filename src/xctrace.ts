import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface XctraceVersion extends Record<string, string | null> {
  raw: string;
  version: string | null;
  build: string | null;
}

export function parseXctraceVersion(output: string): XctraceVersion {
  const raw = output.trim();
  const match = raw.match(/^xctrace version\s+([^\s]+)(?:\s+\(([^)]+)\))?$/);

  return {
    raw,
    version: match?.[1] ?? null,
    build: match?.[2] ?? null
  };
}

export async function getXctraceVersion(): Promise<XctraceVersion> {
  const { stdout } = await execFileAsync("xcrun", ["xctrace", "version"], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024
  });

  return parseXctraceVersion(stdout);
}
