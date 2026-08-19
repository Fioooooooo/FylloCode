import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeTrace,
  formatMarkdown,
  parseTrace,
  run,
} from "../../../../.agents/skills/adapt-acp-events/scripts/analyze-acp-session-updates.mjs";

const FIXTURES = resolve("test/main/scripts/adapt-acp-events/fixtures");
const TEMPLATE = resolve(
  ".agents/skills/adapt-acp-events/assets/agent-session-update-fixture.template.json"
);

async function readFixture(name) {
  return readFile(resolve(FIXTURES, name), "utf8");
}

describe("ACP session/update trace analyzer", () => {
  it("extracts only explicit mapper input records from logger traces", async () => {
    const document = parseTrace(await readFixture("codex-logger-trace.txt"), "codex.log");
    const report = analyzeTrace(document, {
      agentId: "codex-acp",
      agentVersion: "1.2.3",
    });

    expect(report.summary).toEqual({
      eventCount: 3,
      eventTypeCount: 3,
      toolCallCount: 1,
      unknownEventTypeCount: 0,
      invalidRecordCount: 0,
    });
    expect(report.metadata).toEqual({ agentId: "codex-acp", agentVersion: "1.2.3" });
    expect(report.toolCalls[0]).toMatchObject({
      toolCallId: "call-codex-1",
      firstEvent: "tool_call",
      startCount: 1,
      updateCount: 1,
      statuses: ["pending", "completed"],
      replacementSignals: { content: ["non_empty"], locations: ["empty"] },
      subagentMetadataPaths: ["_meta.codex.subagent"],
      anomalies: [],
    });
  });

  it("recognizes orphan updates and unknown event types in JSONL", async () => {
    const document = parseTrace(await readFixture("gemini-updates.jsonl"), "gemini.jsonl");
    const report = analyzeTrace(document);

    expect(report.unknownEventTypes).toEqual([{ type: "future_update", count: 1 }]);
    expect(report.toolCalls[0]).toMatchObject({
      firstEvent: "tool_call_update",
      statuses: ["completed"],
      replacementSignals: { content: ["non_empty"], locations: ["non_empty"] },
      anomalies: ["orphan_update"],
    });
  });

  it("reads whitelisted capture metadata and replacement signals from fixture JSON", async () => {
    const document = parseTrace(
      await readFixture("versioned-fixture.json"),
      "versioned-fixture.json"
    );
    const report = analyzeTrace(document, { agentVersion: "2.1.0" });

    expect(report.metadata).toEqual({
      agentId: "example-acp",
      agentName: "Example ACP",
      agentVersion: "2.1.0",
      agentVersionSource: "unavailable",
      underlyingAgentVersion: "2.0.0",
      acpSdkVersion: "1.0.0",
      capturedAt: "2026-08-19T10:00:00.000Z",
    });
    expect(JSON.stringify(report)).not.toContain("must-not-appear");
    expect(report.toolCalls[0]).toMatchObject({
      statuses: ["pending", "in_progress", "completed"],
      replacementSignals: { content: ["null"], locations: ["empty"] },
      parentMetadataPaths: ["_meta.parentToolUseId"],
      anomalies: [],
    });
  });

  it("accepts JSON arrays and JSON-RPC update wrappers", () => {
    const document = parseTrace(
      JSON.stringify([
        {
          params: {
            update: {
              sessionUpdate: "usage_update",
              used: 1,
              size: 10,
            },
          },
        },
      ]),
      "wrapped.json"
    );

    expect(document.updates).toEqual([{ sessionUpdate: "usage_update", used: 1, size: 10 }]);
  });

  it("produces stable markdown without exposing the source path", async () => {
    const document = parseTrace(await readFixture("gemini-updates.jsonl"), "gemini.jsonl");
    const markdown = formatMarkdown(analyzeTrace(document), "/private/path/gemini.jsonl");

    expect(markdown).toContain("- Source: `gemini.jsonl`");
    expect(markdown).not.toContain("/private/path");
    expect(markdown).toContain("- Anomalies: `orphan_update`");
  });

  it("supports JSON CLI output and metadata overrides", async () => {
    const output = await run([
      resolve(FIXTURES, "gemini-updates.jsonl"),
      "--format",
      "json",
      "--agent-id",
      "gemini",
      "--agent-version-source",
      "unavailable",
    ]);
    const report = JSON.parse(output);

    expect(report.metadata).toEqual({
      agentId: "gemini",
      agentVersionSource: "unavailable",
    });
    expect(report.summary.eventCount).toBe(2);
  });

  it("reports locations without echoing malformed sensitive payloads", async () => {
    const secret = "sensitive-payload-marker";
    const directory = await mkdtemp(resolve(tmpdir(), "acp-invalid-"));
    const path = resolve(directory, "trace.jsonl");
    await writeFile(path, `{${secret}\n`, "utf8");

    try {
      let message = "";
      try {
        await run([path, "--format", "json"]);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toBe("Invalid JSON at trace.jsonl:1.");
      expect(message).not.toContain(secret);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("skips malformed legacy records only when explicitly requested", async () => {
    const secret = "sensitive-legacy-payload";
    const directory = await mkdtemp(resolve(tmpdir(), "acp-legacy-"));
    const path = resolve(directory, "legacy.log");
    await writeFile(
      path,
      [
        '10:00 › [acp-mapper] ← sessionUpdate: usage_update {"sessionUpdate":"usage_update","used":1,"size":2}',
        `10:01 › [acp-mapper] ← sessionUpdate: tool_call {${secret}`,
      ].join("\n"),
      "utf8"
    );

    try {
      await expect(run([path])).rejects.toThrow("Invalid mapper session/update record");
      const report = JSON.parse(await run([path, "--format", "json", "--skip-invalid"]));
      expect(report.summary).toMatchObject({ eventCount: 1, invalidRecordCount: 1 });
      expect(report.parseWarnings).toEqual([
        {
          location: "legacy.log:2",
          reason: "Invalid mapper session/update record at legacy.log:2.",
        },
      ]);
      expect(JSON.stringify(report)).not.toContain(secret);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("rejects tool events without a toolCallId", () => {
    const document = parseTrace('{"sessionUpdate":"tool_call","title":"Missing ID"}');
    expect(() => analyzeTrace(document)).toThrow("Missing toolCallId at event 1.");
  });

  it("keeps the reusable fixture template valid and explicit about unavailable versions", async () => {
    const template = JSON.parse(await readFile(TEMPLATE, "utf8"));

    expect(template.schemaVersion).toBe(1);
    expect(template.capture).toMatchObject({
      agentId: "replace-with-agent-id",
      agentVersion: null,
      agentVersionSource: "unavailable",
      underlyingAgentVersion: null,
    });
    expect(template.updates).toEqual([]);
    expect(template.expectedEvents).toEqual([]);
  });
});
