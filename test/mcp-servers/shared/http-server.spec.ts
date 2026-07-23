import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectPath } from "../../../src/mcp-servers/shared/env";
import {
  startHttpServer,
  type McpHttpServerHandle,
} from "../../../src/mcp-servers/shared/http-server";
import { createMcpServer as createFylloSpecsServer } from "../../../src/mcp-servers/fyllo-specs/src/server";
import { createMcpServer as createFylloCortexServer } from "../../../src/mcp-servers/fyllo-cortex/src/server";

const originalToken = process.env.FYLLO_MCP_AUTH_TOKEN;
const handles: McpHttpServerHandle[] = [];

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function requestHeaders(token = "test-token", projectPath = "/tmp/project"): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "X-Fyllo-Project-Path": encode(projectPath),
    "X-Fyllo-Project-Data-Dir": encode(`${projectPath}/.fyllo`),
  };
}

function createTestServer(): McpServer {
  const server = new McpServer({ name: "test-server", version: "1.0.0" });
  server.registerTool("project-path", { inputSchema: z.object({}) }, async () => ({
    content: [{ type: "text", text: getProjectPath() }],
  }));
  return server;
}

async function post(port: number, body: unknown, headers = requestHeaders()): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function readMcpPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    if (!data) {
      throw new Error("MCP SSE response did not contain a data event");
    }
    return JSON.parse(data) as unknown;
  }
  return JSON.parse(text) as unknown;
}

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
  if (originalToken === undefined) {
    delete process.env.FYLLO_MCP_AUTH_TOKEN;
  } else {
    process.env.FYLLO_MCP_AUTH_TOKEN = originalToken;
  }
  vi.restoreAllMocks();
});

describe("shared MCP HTTP server", () => {
  it("refuses to start without a token", async () => {
    delete process.env.FYLLO_MCP_AUTH_TOKEN;
    await expect(startHttpServer(createTestServer)).rejects.toThrow("FYLLO_MCP_AUTH_TOKEN");
  });

  it("rejects unknown paths, invalid auth, and invalid context", async () => {
    process.env.FYLLO_MCP_AUTH_TOKEN = "test-token";
    const handle = await startHttpServer(createTestServer);
    handles.push(handle);

    const missingPath = await fetch(`http://127.0.0.1:${handle.port}/unknown`);
    expect(missingPath.status).toBe(404);

    const unauthorized = await post(
      handle.port,
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      requestHeaders("wrong-token")
    );
    expect(unauthorized.status).toBe(401);

    const invalidContext = await post(
      handle.port,
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      {
        Authorization: "Bearer test-token",
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      }
    );
    expect(invalidContext.status).toBe(400);
  });

  it("creates an independent server for every request and isolates context", async () => {
    process.env.FYLLO_MCP_AUTH_TOKEN = "test-token";
    const factory = vi.fn(createTestServer);
    const handle = await startHttpServer(factory);
    handles.push(handle);

    const bodies = ["/tmp/project-a", "/tmp/project-b"].map((projectPath, index) =>
      post(
        handle.port,
        {
          jsonrpc: "2.0",
          id: index + 1,
          method: "tools/call",
          params: { name: "project-path", arguments: {} },
        },
        requestHeaders("test-token", projectPath)
      )
    );
    const responses = await Promise.all(bodies);
    const payloads = await Promise.all(responses.map(readMcpPayload));

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          result: expect.objectContaining({
            content: [expect.objectContaining({ text: "/tmp/project-a" })],
          }),
        }),
        expect.objectContaining({
          result: expect.objectContaining({
            content: [expect.objectContaining({ text: "/tmp/project-b" })],
          }),
        }),
      ])
    );
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("reports its random loopback port over IPC and closes idempotently", async () => {
    process.env.FYLLO_MCP_AUTH_TOKEN = "test-token";
    const send = vi.fn();
    const originalSend = process.send;
    Object.defineProperty(process, "send", { configurable: true, value: send });

    try {
      const handle = await startHttpServer(createTestServer);
      handles.push(handle);
      expect(handle.port).toBeGreaterThan(0);
      expect(send).toHaveBeenCalledWith({ type: "ready", port: handle.port });
      await handle.close();
      await handle.close();
    } finally {
      Object.defineProperty(process, "send", { configurable: true, value: originalSend });
    }
  });

  it.each([
    ["fyllo-specs", createFylloSpecsServer, "explore"],
    ["fyllo-cortex", createFylloCortexServer, "guidelines"],
  ])("serves the registered %s tools over HTTP", async (_name, factory, expectedTool) => {
    process.env.FYLLO_MCP_AUTH_TOKEN = "test-token";
    const countedFactory = vi.fn(factory);
    const handle = await startHttpServer(countedFactory);
    handles.push(handle);

    const response = await post(handle.port, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    const payload = (await readMcpPayload(response)) as {
      result?: { tools?: Array<{ name: string }> };
    };

    expect(response.status).toBe(200);
    expect(payload.result?.tools?.map((tool) => tool.name)).toContain(expectedTool);
    expect(countedFactory).toHaveBeenCalledTimes(1);
  });
});
