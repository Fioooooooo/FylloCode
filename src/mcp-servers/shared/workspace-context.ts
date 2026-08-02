import {
  deserializeMcpWorkspaceDescriptor,
  type McpWorkspaceDescriptorV2,
} from "@shared/types/mcp-workspace";
import { tryGetRequestContext } from "./request-context";

export const FYLLO_WORKSPACE_JSON_ENV = "FYLLO_WORKSPACE_JSON";

let stdioWorkspaceContext: McpWorkspaceDescriptorV2 | undefined;

function readStdioWorkspaceContext(): McpWorkspaceDescriptorV2 {
  if (stdioWorkspaceContext) {
    return stdioWorkspaceContext;
  }

  const serialized = process.env[FYLLO_WORKSPACE_JSON_ENV];
  if (!serialized) {
    throw new Error(`${FYLLO_WORKSPACE_JSON_ENV} is required outside an HTTP request`);
  }
  stdioWorkspaceContext = deserializeMcpWorkspaceDescriptor(serialized);
  return stdioWorkspaceContext;
}

export function getWorkspaceContext(): McpWorkspaceDescriptorV2 {
  return tryGetRequestContext() ?? readStdioWorkspaceContext();
}

export function resetStdioWorkspaceContextForTests(): void {
  stdioWorkspaceContext = undefined;
}
