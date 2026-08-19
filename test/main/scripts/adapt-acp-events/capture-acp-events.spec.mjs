import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  run,
  terminateChildProcess,
  validateCapturePlan,
} from "../../../../.agents/skills/adapt-acp-events/scripts/capture-acp-events.mjs";
import {
  analyzeTrace,
  parseTrace,
} from "../../../../.agents/skills/adapt-acp-events/scripts/analyze-acp-session-updates.mjs";

const FAKE_AGENT = resolve("test/main/scripts/adapt-acp-events/fixtures/fake-acp-agent.mjs");
const PLAN_TEMPLATE = resolve(
  ".agents/skills/adapt-acp-events/assets/acp-capture-plan.template.json"
);

function capturePlan(workspace, overrides = {}) {
  return {
    schemaVersion: 1,
    capture: {
      agentId: "fake-acp",
      agentName: "Fake ACP",
      agentVersion: "1.0.0",
      agentVersionSource: "test-fixture",
      underlyingAgentVersion: null,
      acpSdkVersion: "1.3.0",
    },
    command: process.execPath,
    args: [FAKE_AGENT],
    cwd: workspace,
    env: {},
    clientInfo: { name: "FylloCode", version: "test" },
    mcpServers: [],
    timeouts: {
      spawnMs: 2_000,
      initializeMs: 2_000,
      newSessionMs: 2_000,
      promptMs: 2_000,
      shutdownGraceMs: 100,
      forceKillGraceMs: 100,
    },
    prompts: [
      {
        scenario: "first tool",
        prompt: [{ type: "text", text: "sample first tool" }],
        continueOnError: false,
      },
    ],
    ...overrides,
  };
}

function fakeChild(pid = 12345) {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.pid = pid;
  child.stdin = { end: vi.fn() };
  child.kill = vi.fn();
  return child;
}

describe("ACP event capture runner", () => {
  let directory;
  let workspace;
  let planPath;

  beforeEach(async () => {
    directory = await mkdtemp(resolve(tmpdir(), "acp-capture-runner-"));
    workspace = resolve(directory, "workspace");
    planPath = resolve(directory, "capture-plan.json");
    await mkdir(workspace);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function writePlan(plan) {
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  }

  it("captures early updates, multiple prompts, permissions, and analyzer-compatible output", async () => {
    await writePlan(
      capturePlan(workspace, {
        prompts: [
          {
            scenario: "first tool",
            prompt: [{ type: "text", text: "sample first tool" }],
            continueOnError: false,
          },
          {
            scenario: "second tool",
            prompt: [{ type: "text", text: "sample second tool" }],
            continueOnError: false,
          },
        ],
      })
    );

    const result = await run([planPath]);
    const saved = JSON.parse(await readFile(result.capturePath, "utf8"));

    expect(result.state.status).toBe("completed");
    expect(saved.updates[0].update).toMatchObject({
      sessionUpdate: "usage_update",
      used: 1,
      size: 10,
    });
    expect(saved.permissionRequests).toHaveLength(2);
    expect(saved.permissionRequests.map((entry) => entry.outcome)).toEqual([
      { outcome: "selected", optionId: "allow-once" },
      { outcome: "selected", optionId: "allow-once" },
    ]);
    expect(saved.prompts.map((entry) => entry.status)).toEqual(["completed", "completed"]);
    expect(saved.process.cleanup.completed).toBe(true);

    const report = analyzeTrace(parseTrace(JSON.stringify(saved), "capture.json"));
    expect(report.metadata).toMatchObject({ agentId: "fake-acp", agentVersion: "1.0.0" });
    expect(report.summary).toMatchObject({ eventCount: 5, toolCallCount: 2 });
  });

  it("persists environment failure diagnostics without copying env or prompts", async () => {
    const secretEnvironmentValue = "environment-secret-marker";
    const secretPrompt = "prompt-secret-marker";
    await writePlan(
      capturePlan(workspace, {
        env: {
          FAKE_ACP_MODE: "environment-failure-large",
          PRIVATE_SAMPLE_VALUE: secretEnvironmentValue,
        },
        prompts: [
          {
            scenario: "unreached",
            prompt: [{ type: "text", text: secretPrompt }],
            continueOnError: false,
          },
        ],
      })
    );

    const result = await run([planPath]);
    const text = await readFile(result.capturePath, "utf8");
    const saved = JSON.parse(text);

    expect(saved.status).toBe("failed");
    expect(saved.phases.find((phase) => phase.name === "initialize")).toMatchObject({
      status: "failed",
    });
    expect(saved.diagnostics).toContainEqual(
      expect.objectContaining({ code: "FILE_WATCH_UNAVAILABLE", phase: "initialize" })
    );
    expect(saved.process.stderrTail).toContain("EMFILE: too many open files, watch");
    expect(saved.process.stderrTruncated).toBe(true);
    expect(Buffer.byteLength(saved.process.stderrTail, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(text).not.toContain(secretEnvironmentValue);
    expect(text).not.toContain(secretPrompt);
  });

  it("records a cancelled fallback without blocking a completed prompt", async () => {
    await writePlan(capturePlan(workspace, { env: { FAKE_ACP_MODE: "no-allow" } }));

    const result = await run([planPath]);

    expect(result.state.status).toBe("completed");
    expect(result.state.permissionRequests[0].outcome).toEqual({ outcome: "cancelled" });
    expect(result.state.prompts[0].status).toBe("completed");
    expect(result.state.updates.at(-1).update).toMatchObject({
      sessionUpdate: "tool_call_update",
      status: "failed",
    });
  });

  it("stops after an unacknowledged prompt timeout and still cleans up the Agent", async () => {
    await writePlan(
      capturePlan(workspace, {
        env: { FAKE_ACP_MODE: "hang-prompt" },
        prompts: [
          {
            scenario: "timeout",
            prompt: [{ type: "text", text: "hang safely" }],
            continueOnError: true,
            timeoutMs: 50,
          },
        ],
      })
    );

    const result = await run([planPath]);

    expect(result.state.status).toBe("failed");
    expect(result.state.prompts[0]).toMatchObject({
      scenario: "timeout",
      status: "failed",
      error: { code: "PHASE_TIMEOUT" },
      cancelSettled: false,
    });
    expect(result.state.diagnostics).toContainEqual(
      expect.objectContaining({ code: "PHASE_TIMEOUT", phase: "prompt:1" })
    );
    expect(result.state.process.cleanup.completed).toBe(true);
  });

  it("validates plans before launching an Agent", () => {
    const plan = capturePlan(workspace);
    expect(validateCapturePlan(plan)).toMatchObject({ command: process.execPath, cwd: workspace });
    expect(() => validateCapturePlan({ ...plan, cwd: "relative" })).toThrow(
      "cwd must be an absolute path"
    );
    expect(() => validateCapturePlan({ ...plan, unexpected: true })).toThrow(
      "Unknown field plan.unexpected"
    );
  });

  it("keeps the reusable capture-plan template valid", async () => {
    const template = JSON.parse(await readFile(PLAN_TEMPLATE, "utf8"));
    expect(validateCapturePlan(template)).toMatchObject({
      schemaVersion: 1,
      capture: {
        agentId: "replace-with-agent-id",
        agentVersion: null,
        agentVersionSource: "unavailable",
      },
    });
  });
});

describe("ACP event capture process cleanup", () => {
  const timeouts = {
    shutdownGraceMs: 1,
    forceKillGraceMs: 1,
  };

  it("escalates a POSIX process group from SIGTERM to SIGKILL", async () => {
    const child = fakeChild();
    const killProcess = vi.fn((_pid, signal) => {
      if (signal === "SIGKILL") queueMicrotask(() => child.emit("close", null, "SIGKILL"));
      return true;
    });

    const result = await terminateChildProcess(child, timeouts, {
      platform: "darwin",
      killProcess,
    });

    expect(child.stdin.end).toHaveBeenCalledOnce();
    expect(killProcess.mock.calls).toEqual([
      [-12345, "SIGTERM"],
      [-12345, 0],
      [-12345, "SIGKILL"],
    ]);
    expect(result).toEqual({ method: "sigkill", forced: true, completed: true });
  });

  it("uses taskkill for a Windows process tree", async () => {
    const child = fakeChild(54321);
    const killer = new EventEmitter();
    killer.unref = vi.fn();
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => killer.emit("close", 0));
      return killer;
    });

    const result = await terminateChildProcess(child, timeouts, {
      platform: "win32",
      spawnProcess,
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      "taskkill",
      ["/pid", "54321", "/T", "/F"],
      expect.objectContaining({ stdio: "ignore", detached: true })
    );
    expect(result).toEqual({ method: "taskkill", forced: true, completed: true });
  });
});
