import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deserializeMcpWorkspaceDescriptor,
  MAX_MCP_WORKSPACE_CONTEXT_BYTES,
  mcpWorkspaceDescriptorV2Schema,
  parseMcpWorkspaceDescriptor,
  serializeMcpWorkspaceDescriptor,
} from "@shared/types/mcp-workspace";

const rootA = resolve("/work/root-a");
const rootB = resolve("/work/root-b");
const workspaceDataDir = resolve("/app-data/workspaces/workspace-1");

function descriptor() {
  return {
    version: 2 as const,
    workspaceId: "workspace-1",
    workspaceKind: "collection" as const,
    primaryFolderId: "folder-a",
    folders: [
      { folderId: "folder-a", folderName: "A", folderPath: rootA },
      { folderId: "folder-b", folderName: "B", folderPath: rootB },
    ],
    workspaceDataDir,
    mcpEventDir: resolve(workspaceDataDir, "mcp-events"),
    sessionId: "session-1",
  };
}

describe("MCP Workspace v2 descriptor", () => {
  it("round-trips a valid descriptor and freezes its authorization snapshot", () => {
    const parsed = deserializeMcpWorkspaceDescriptor(serializeMcpWorkspaceDescriptor(descriptor()));

    expect(parsed).toEqual(descriptor());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.folders)).toBe(true);
    expect(Object.isFrozen(parsed.folders[0])).toBe(true);
  });

  it("requires primaryFolderId to match exactly one Folder", () => {
    expect(
      mcpWorkspaceDescriptorV2Schema.safeParse({
        ...descriptor(),
        primaryFolderId: "folder-missing",
      }).success
    ).toBe(false);
  });

  it("rejects duplicate Folder IDs", () => {
    expect(
      mcpWorkspaceDescriptorV2Schema.safeParse({
        ...descriptor(),
        folders: [descriptor().folders[0], { ...descriptor().folders[1], folderId: "folder-a" }],
      }).success
    ).toBe(false);
  });

  it("rejects non-canonical and relative Folder paths", () => {
    expect(
      mcpWorkspaceDescriptorV2Schema.safeParse({
        ...descriptor(),
        folders: [{ ...descriptor().folders[0], folderPath: `${rootA}/../root-a` }],
      }).success
    ).toBe(false);
    expect(
      mcpWorkspaceDescriptorV2Schema.safeParse({
        ...descriptor(),
        folders: [{ ...descriptor().folders[0], folderPath: "relative/root" }],
      }).success
    ).toBe(false);
  });

  it("rejects invalid versions and unknown fields", () => {
    expect(mcpWorkspaceDescriptorV2Schema.safeParse({ ...descriptor(), version: 1 }).success).toBe(
      false
    );
    expect(
      mcpWorkspaceDescriptorV2Schema.safeParse({ ...descriptor(), projectPath: rootA }).success
    ).toBe(false);
  });

  it("enforces the serialized context size boundary", () => {
    const oversized = {
      ...descriptor(),
      folders: [
        {
          ...descriptor().folders[0],
          folderName: "x".repeat(MAX_MCP_WORKSPACE_CONTEXT_BYTES),
        },
      ],
    };

    expect(() => serializeMcpWorkspaceDescriptor(oversized)).toThrow(/maximum serialized size/);
    expect(() =>
      deserializeMcpWorkspaceDescriptor("{".repeat(MAX_MCP_WORKSPACE_CONTEXT_BYTES + 1))
    ).toThrow(/maximum serialized size/);
  });

  it("rejects malformed JSON at the deserialize boundary", () => {
    expect(() => deserializeMcpWorkspaceDescriptor("{")).toThrow(/valid JSON/);
    expect(() => parseMcpWorkspaceDescriptor({ version: 2 })).toThrow();
  });
});
