import { AsyncLocalStorage } from "node:async_hooks";
import { TextDecoder } from "node:util";

export const FYLLO_CONTEXT_HEADERS = {
  projectPath: "x-fyllo-project-path",
  projectDataDir: "x-fyllo-project-data-dir",
  mcpEventDir: "x-fyllo-mcp-event-dir",
  sessionId: "x-fyllo-session-id",
} as const;

export interface RequestContext {
  projectPath: string;
  projectDataDir: string;
  mcpEventDir?: string;
  sessionId?: string;
}

export type RequestHeaders = Record<string, string | string[] | undefined>;

const storage = new AsyncLocalStorage<RequestContext>();
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function readHeader(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    throw new Error(`Header ${name} must contain a single value`);
  }
  return value;
}

export function decodeContextHeader(value: string, name: string): string {
  if (!base64UrlPattern.test(value) || value.length % 4 === 1) {
    throw new Error(`Header ${name} must be valid base64url`);
  }

  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) {
      throw new Error("non-canonical base64url");
    }
    return utf8Decoder.decode(bytes);
  } catch {
    throw new Error(`Header ${name} must contain valid UTF-8 base64url`);
  }
}

function decodeRequired(headers: RequestHeaders, name: string): string {
  const value = readHeader(headers, name);
  if (!value) {
    throw new Error(`Missing required header: ${name}`);
  }
  const decoded = decodeContextHeader(value, name);
  if (!decoded) {
    throw new Error(`Header ${name} must not be empty`);
  }
  return decoded;
}

function decodeOptional(headers: RequestHeaders, name: string): string | undefined {
  const value = readHeader(headers, name);
  if (value === undefined) {
    return undefined;
  }
  return decodeContextHeader(value, name);
}

export function parseRequestContext(headers: RequestHeaders): RequestContext {
  const mcpEventDir = decodeOptional(headers, FYLLO_CONTEXT_HEADERS.mcpEventDir);
  const sessionId = decodeOptional(headers, FYLLO_CONTEXT_HEADERS.sessionId);
  return {
    projectPath: decodeRequired(headers, FYLLO_CONTEXT_HEADERS.projectPath),
    projectDataDir: decodeRequired(headers, FYLLO_CONTEXT_HEADERS.projectDataDir),
    ...(mcpEventDir !== undefined ? { mcpEventDir } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
  };
}

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function tryGetRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestContext(): RequestContext {
  const context = tryGetRequestContext();
  if (!context) {
    throw new Error("MCP request context is not available");
  }
  return context;
}
