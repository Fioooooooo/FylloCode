import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools";
import { FYLLO_SPECS_SERVER_VERSION } from "./version";

export async function startServer(signal?: AbortSignal): Promise<void> {
  const server = new McpServer({ name: "fyllo-specs", version: FYLLO_SPECS_SERVER_VERSION });
  const transport = new StdioServerTransport();

  registerTools(server);

  await server.connect(transport);

  if (signal) {
    signal.addEventListener("abort", () => {
      void transport.close();
    });
  }
}
