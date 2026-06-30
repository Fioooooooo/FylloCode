import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExploreTool } from "./explore";
import { registerCreatePlanTool } from "./create-plan";
import { registerCreateProposalTool } from "./create-proposal";
import { registerApplyChangeTool } from "./apply-change";
import { registerArchiveChangeTool } from "./archive-change";

export function registerTools(server: McpServer): void {
  registerExploreTool(server);
  registerCreatePlanTool(server);
  registerCreateProposalTool(server);
  registerApplyChangeTool(server);
  registerArchiveChangeTool(server);
}
