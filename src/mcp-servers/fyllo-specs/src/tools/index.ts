import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExploreTool } from "./explore";
import { registerCreateProposalTool } from "./create-proposal";
import { registerApplyChangeTool } from "./apply-change";
import { registerArchiveChangeTool } from "./archive-change";

export function registerTools(server: McpServer): void {
  registerExploreTool(server);
  registerCreateProposalTool(server);
  registerApplyChangeTool(server);
  registerArchiveChangeTool(server);
}
