import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGuidelinesTool } from "./guidelines";

export function registerTools(server: McpServer): void {
  registerGuidelinesTool(server);
}
