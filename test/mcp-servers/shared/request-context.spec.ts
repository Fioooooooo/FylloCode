import { afterEach, describe, expect, it } from "vitest";
import {
  decodeContextHeader,
  FYLLO_CONTEXT_HEADERS,
  getRequestContext,
  parseRequestContext,
  runWithRequestContext,
  tryGetRequestContext,
} from "../../../src/mcp-servers/shared/request-context";
import {
  getMcpEventDir,
  getProjectDataDir,
  getProjectPath,
  getSessionId,
  requireProjectDataDir,
  requireSessionId,
} from "../../../src/mcp-servers/shared/env";

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

const originalEnv = {
  projectPath: process.env.FYLLO_PROJECT_PATH,
  projectDataDir: process.env.FYLLO_PROJECT_DATA_DIR,
  eventDir: process.env.FYLLO_MCP_EVENT_DIR,
  sessionId: process.env.FYLLO_SESSION_ID,
};

afterEach(() => {
  for (const [name, value] of [
    ["FYLLO_PROJECT_PATH", originalEnv.projectPath],
    ["FYLLO_PROJECT_DATA_DIR", originalEnv.projectDataDir],
    ["FYLLO_MCP_EVENT_DIR", originalEnv.eventDir],
    ["FYLLO_SESSION_ID", originalEnv.sessionId],
  ] as const) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("request context", () => {
  it("decodes unicode and optional context headers", () => {
    const context = parseRequestContext({
      [FYLLO_CONTEXT_HEADERS.projectPath]: encode("/tmp/中文 project"),
      [FYLLO_CONTEXT_HEADERS.projectDataDir]: encode("/tmp/数据"),
      [FYLLO_CONTEXT_HEADERS.mcpEventDir]: encode("/tmp/事件"),
      [FYLLO_CONTEXT_HEADERS.sessionId]: encode("会话-1"),
    });

    expect(context).toEqual({
      projectPath: "/tmp/中文 project",
      projectDataDir: "/tmp/数据",
      mcpEventDir: "/tmp/事件",
      sessionId: "会话-1",
    });
  });

  it("rejects missing, malformed, and invalid UTF-8 headers", () => {
    expect(() => parseRequestContext({})).toThrow("Missing required header");
    expect(() => decodeContextHeader("not+base64", "x-test")).toThrow("base64url");
    expect(() => decodeContextHeader("_w", "x-test")).toThrow("UTF-8");
  });

  it("isolates concurrent async request contexts", async () => {
    const first = runWithRequestContext(
      { projectPath: "/project-a", projectDataDir: "/data-a", sessionId: "a" },
      async () => {
        await Promise.resolve();
        return { path: getProjectPath(), sessionId: getSessionId() };
      }
    );
    const second = runWithRequestContext(
      { projectPath: "/project-b", projectDataDir: "/data-b", sessionId: "b" },
      async () => {
        await Promise.resolve();
        return { path: getProjectPath(), sessionId: getSessionId() };
      }
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { path: "/project-a", sessionId: "a" },
      { path: "/project-b", sessionId: "b" },
    ]);
    expect(tryGetRequestContext()).toBeUndefined();
    expect(() => getRequestContext()).toThrow("not available");
  });

  it("prefers request context and leaves process env unchanged", () => {
    process.env.FYLLO_PROJECT_PATH = "/env-project";
    process.env.FYLLO_PROJECT_DATA_DIR = "/env-data";
    process.env.FYLLO_MCP_EVENT_DIR = "/env-events";
    process.env.FYLLO_SESSION_ID = "env-session";

    const before = { ...process.env };
    const values = runWithRequestContext(
      {
        projectPath: "/request-project",
        projectDataDir: "/request-data",
        mcpEventDir: "/request-events",
        sessionId: "request-session",
      },
      () => ({
        projectPath: getProjectPath(),
        projectDataDir: requireProjectDataDir(),
        eventDir: getMcpEventDir(),
        sessionId: requireSessionId(),
      })
    );

    expect(values).toEqual({
      projectPath: "/request-project",
      projectDataDir: "/request-data",
      eventDir: "/request-events",
      sessionId: "request-session",
    });
    expect(process.env).toEqual(before);
  });

  it("falls back to stdio environment variables", () => {
    process.env.FYLLO_PROJECT_PATH = "/env-project";
    process.env.FYLLO_PROJECT_DATA_DIR = "/env-data";
    process.env.FYLLO_MCP_EVENT_DIR = "/env-events";
    process.env.FYLLO_SESSION_ID = "env-session";

    expect(getProjectPath()).toBe("/env-project");
    expect(getProjectDataDir()).toBe("/env-data");
    expect(getMcpEventDir()).toBe("/env-events");
    expect(getSessionId()).toBe("env-session");
  });
});
