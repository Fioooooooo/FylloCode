import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGuidelinesTool } from "./guidelines";
import { registerKnowledgeTool } from "./knowledge";
import { registerLineageTool } from "./lineage";

export function registerTools(server: McpServer): void {
  registerGuidelinesTool(server);
  registerKnowledgeTool(server);
  registerLineageTool(server);
}
