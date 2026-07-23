import { tryGetRequestContext } from "./request-context";

export function getProjectPath(): string {
  return tryGetRequestContext()?.projectPath ?? process.env.FYLLO_PROJECT_PATH ?? process.cwd();
}

export function getProjectDataDir(): string | undefined {
  return tryGetRequestContext()?.projectDataDir ?? process.env.FYLLO_PROJECT_DATA_DIR;
}

export function requireProjectDataDir(): string {
  const value = getProjectDataDir();
  if (!value) {
    throw new Error("FYLLO_PROJECT_DATA_DIR is required");
  }
  return value;
}

export function getMcpEventDir(): string | undefined {
  return tryGetRequestContext()?.mcpEventDir ?? process.env.FYLLO_MCP_EVENT_DIR;
}

export function getSessionId(): string | undefined {
  return tryGetRequestContext()?.sessionId ?? process.env.FYLLO_SESSION_ID;
}

export function requireSessionId(): string {
  const value = getSessionId();
  if (!value) {
    throw new Error("FYLLO_SESSION_ID is required");
  }
  return value;
}
