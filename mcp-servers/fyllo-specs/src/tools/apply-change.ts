import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync } from "fs";
import { z } from "zod";
import { runTool } from "../utils/state";
import { validateTargetPath } from "../utils/project-root";
import { changeDir } from "../openspec-runtime";
import { loadApplyState } from "../openspec-runtime/tasks";

const applyChangeInputSchema = z.object({
  changeName: z
    .string()
    .describe(
      "Name of the change to implement. Use the explore tool first if multiple active changes exist and the target is not yet decided."
    ),
  targetPath: z
    .string()
    .min(1)
    .describe("Absolute path to the project root or a registered git worktree."),
  includeInstruction: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Defaults to true; keep true on the first call of a run. The instruction text encodes the apply workflow contract (which artifacts to read, the order, how to pick the next task, and how to update tasks.md) that cannot be reconstructed from prior knowledge — omitting it loses the per-task constraints. Only pass false for follow-up state-polling calls within the same run, after the instruction has already been read and acted on."
    ),
});

export async function applyChangeTool(
  input: z.infer<typeof applyChangeInputSchema>
): Promise<string> {
  return runTool("apply-change", { includeInstruction: input.includeInstruction }, async () => {
    const result = validateTargetPath(input.targetPath);
    if (!result.ok) {
      const error = new Error(
        result.rawOutput ? `${result.error}\n\n${result.rawOutput}` : result.error
      );
      error.name = "InvalidTargetPath";
      throw error;
    }

    const projectRoot = result.resolved;
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
