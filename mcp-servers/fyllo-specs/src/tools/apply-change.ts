import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync } from "fs";
import { z } from "zod";
import { runTool } from "../utils/state";
import { resolveProjectRoot } from "../utils/project-root";
import { changeDir } from "../openspec-runtime";
import { loadApplyState } from "../openspec-runtime/tasks";

const applyChangeInputSchema = z.object({
  changeName: z
    .string()
    .describe(
      "Name of the change to implement. Use the explore tool first if multiple active changes exist and the target is not yet decided."
    ),
  includeInstruction: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Set to false to omit the skill instruction text and return only the state JSON. Useful when the agent already knows the workflow."
    ),
});

export async function applyChangeTool(
  input: z.infer<typeof applyChangeInputSchema>
): Promise<string> {
  return runTool("apply-change", { includeInstruction: input.includeInstruction }, async () => {
    const projectRoot = resolveProjectRoot();
    if (!existsSync(changeDir(projectRoot, input.changeName))) {
      throw new Error(`Change not found: ${input.changeName}`);
    }
    return loadApplyState(projectRoot, input.changeName);
  });
}

export function registerApplyChangeTool(server: McpServer): void {
  server.registerTool(
    "apply-change",
    {
      description:
        "Implement tasks from an OpenSpec change. Use when the user wants to start implementing, continue implementation, or work through tasks. Confirm which change to apply before calling — use the explore tool to list active changes if uncertain.",
      inputSchema: applyChangeInputSchema,
    },
    async (input) => {
      return {
        content: [{ type: "text" as const, text: await applyChangeTool(input) }],
      };
    }
  );
}
