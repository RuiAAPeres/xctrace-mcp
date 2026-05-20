import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseXctraceVersion } from "../src/xctrace.js";

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
