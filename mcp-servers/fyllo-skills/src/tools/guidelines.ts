import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadPrompt } from "../utils/load-prompt";

const guidelinesInputSchema = z.object({}).strict();

export function guidelinesTool(): string {
  return `<tool_instruction>\n${loadPrompt("guidelines")}\n</tool_instruction>`;
}

export function registerGuidelinesTool(server: McpServer): void {
  server.registerTool(
    "guidelines",
    {
      description: "Return the repository guidelines file contract and maintenance rules.",
      inputSchema: guidelinesInputSchema,
    },
    async () => {
      return {
        content: [{ type: "text" as const, text: guidelinesTool() }],
      };
    }
  );
}
