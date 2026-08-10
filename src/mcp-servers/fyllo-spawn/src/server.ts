import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { startHttpServer } from "../../shared/http-server";
import { SpawnRpcClient } from "./rpc-client";
import { registerTools } from "./tools";
import { FYLLO_SPAWN_SERVER_VERSION } from "./version";

export function createMcpServer(rpc: SpawnRpcClient): McpServer {
  const server = new McpServer({ name: "fyllo-spawn", version: FYLLO_SPAWN_SERVER_VERSION });
  registerTools(server, rpc);
  return server;
}

export async function startServer(signal?: AbortSignal): Promise<void> {
  if (process.env.FYLLO_MCP_TRANSPORT !== "http") {
    throw new Error("fyllo-spawn supports HTTP transport only");
  }

  const rpc = new SpawnRpcClient();
  signal?.addEventListener("abort", () => rpc.close(), { once: true });
  await startHttpServer(() => createMcpServer(rpc), signal);
}
