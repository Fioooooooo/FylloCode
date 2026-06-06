import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

export function invalidParams(message: string): McpError {
  return new McpError(ErrorCode.InvalidParams, message);
}

export function invalidRequest(message: string): McpError {
  return new McpError(ErrorCode.InvalidRequest, message);
}

export function internalError(message: string): McpError {
  return new McpError(ErrorCode.InternalError, message);
}
