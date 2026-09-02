import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { startHttpServer } from "../../shared/http-server";
import { WorkflowRpcClient } from "./rpc-client";
import { registerTools } from "./tools";
import { FYLLO_WORKFLOW_SERVER_VERSION } from "./version";

export function createMcpServer(rpc: WorkflowRpcClient): McpServer {
  const server = new McpServer({
    name: "fyllo-workflow",
    version: FYLLO_WORKFLOW_SERVER_VERSION,
  });
  registerTools(server, rpc);
  return server;
}

export async function startServer(signal?: AbortSignal): Promise<void> {
  if (process.env.FYLLO_MCP_TRANSPORT !== "http") {
    throw new Error("fyllo-workflow supports HTTP transport only");
  }

  const rpc = new WorkflowRpcClient();
  signal?.addEventListener("abort", () => rpc.close(), { once: true });
  await startHttpServer(() => createMcpServer(rpc), signal);
}
