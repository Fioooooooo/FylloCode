import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeContextHeader,
  FYLLO_WORKSPACE_CONTEXT_HEADER,
  getRequestContext,
  parseRequestContext,
  runWithRequestContext,
  tryGetRequestContext,
} from "../../../src/mcp-servers/shared/request-context";
import {
  parseMcpWorkspaceDescriptor,
  serializeMcpWorkspaceDescriptor,
} from "@shared/types/mcp-workspace";

function descriptor(workspaceId: string, folderName = workspaceId) {
  return parseMcpWorkspaceDescriptor({
    version: 2,
    workspaceId,
    workspaceKind: "folder",
    primaryFolderId: `folder-${workspaceId}`,
    folders: [
      {
        folderId: `folder-${workspaceId}`,
        folderName,
        folderPath: resolve(`/work/${workspaceId}`),
      },
    ],
    workspaceDataDir: resolve(`/data/${workspaceId}`),
    mcpEventDir: resolve(`/data/${workspaceId}/mcp-events`),
    sessionId: `session-${workspaceId}`,
  });
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

describe("Workspace v2 request context", () => {
  it("decodes a Unicode Workspace descriptor from the sole internal context header", () => {
    const expected = descriptor("workspace-1", "中文 Workspace");
    const context = parseRequestContext({
      [FYLLO_WORKSPACE_CONTEXT_HEADER]: encode(serializeMcpWorkspaceDescriptor(expected)),
    });

    expect(context).toEqual(expected);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("rejects missing, repeated, malformed, invalid UTF-8, and invalid descriptors", () => {
    expect(() => parseRequestContext({})).toThrow("Missing required header");
    expect(() => parseRequestContext({ [FYLLO_WORKSPACE_CONTEXT_HEADER]: ["a", "b"] })).toThrow(
      "single value"
    );
    expect(() => decodeContextHeader("not+base64", "x-test")).toThrow("base64url");
    expect(() => decodeContextHeader("_w", "x-test")).toThrow("UTF-8");
    expect(() =>
      parseRequestContext({ [FYLLO_WORKSPACE_CONTEXT_HEADER]: encode('{"version":1}') })
    ).toThrow();
  });

  it("isolates concurrent async Workspace contexts", async () => {
    const first = runWithRequestContext(descriptor("workspace-a"), async () => {
      await Promise.resolve();
      return {
        workspaceId: getRequestContext().workspaceId,
        folderPath: getRequestContext().folders[0]?.folderPath,
      };
    });
    const second = runWithRequestContext(descriptor("workspace-b"), async () => {
      await Promise.resolve();
      return {
        workspaceId: getRequestContext().workspaceId,
        folderPath: getRequestContext().folders[0]?.folderPath,
      };
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { workspaceId: "workspace-a", folderPath: resolve("/work/workspace-a") },
      { workspaceId: "workspace-b", folderPath: resolve("/work/workspace-b") },
    ]);
    expect(tryGetRequestContext()).toBeUndefined();
    expect(() => getRequestContext()).toThrow("not available");
  });
});
