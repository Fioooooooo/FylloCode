import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startHttpServer } from "../../shared/http-server";
import { registerTools } from "./tools";
import { FYLLO_SPECS_SERVER_VERSION } from "./version";

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "fyllo-specs", version: FYLLO_SPECS_SERVER_VERSION });
  registerTools(server);
  return server;
}

export async function startServer(signal?: AbortSignal): Promise<void> {
  if (process.env.FYLLO_MCP_TRANSPORT === "http") {
    await startHttpServer(createMcpServer, signal);
    return;
  }

  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (signal) {
    signal.addEventListener("abort", () => {
      void transport.close();
    });
  }
}
