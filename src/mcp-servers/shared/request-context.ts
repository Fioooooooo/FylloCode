import { AsyncLocalStorage } from "node:async_hooks";
import { TextDecoder } from "node:util";
import {
  deserializeMcpWorkspaceDescriptor,
  FYLLO_WORKSPACE_CONTEXT_HEADER,
  type McpWorkspaceDescriptorV2,
} from "@shared/types/mcp-workspace";

export { FYLLO_WORKSPACE_CONTEXT_HEADER };
export type RequestContext = McpWorkspaceDescriptorV2;
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

export function parseRequestContext(headers: RequestHeaders): RequestContext {
  const value = readHeader(headers, FYLLO_WORKSPACE_CONTEXT_HEADER);
  if (!value) {
    throw new Error(`Missing required header: ${FYLLO_WORKSPACE_CONTEXT_HEADER}`);
  }
  return deserializeMcpWorkspaceDescriptor(
    decodeContextHeader(value, FYLLO_WORKSPACE_CONTEXT_HEADER)
  );
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
