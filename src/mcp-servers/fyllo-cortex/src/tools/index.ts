import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGuidelinesTool } from "./guidelines";
import { registerLineageTool } from "./lineage";

export function registerTools(server: McpServer): void {
  registerGuidelinesTool(server);
  registerLineageTool(server);
}
