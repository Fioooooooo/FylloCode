import { resolveWorkspace } from "./workspace-resolver";

export function getWorkspaceDataDir(): string {
  return resolveWorkspace().workspaceDataDir;
}

export function getMcpEventDir(): string | undefined {
  return resolveWorkspace().mcpEventDir;
}

export function getSessionId(): string | undefined {
  return resolveWorkspace().sessionId;
}

export function requireSessionId(): string {
  const value = getSessionId();
  if (!value) {
    throw new Error("Workspace MCP descriptor sessionId is required");
  }
  return value;
}
