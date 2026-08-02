import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "../utils/state";
import { loadApplyState } from "../runtime-openspec/tasks";
import { resolveProposalTarget } from "../runtime-workspace";

const applyChangeInputSchema = z.object({
  changeName: z
    .string()
    .describe(
      "Name of the change to implement. Use the explore tool first if multiple active changes exist and the target is not yet decided."
    ),
  folderId: z.string().min(1).describe("Owner Folder ID from the proposal's ProposalRef."),
  includeInstruction: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Defaults to true; keep true on the first call of a run. The instruction text encodes the apply workflow contract (which artifacts to read, the order, how to pick the next task, and how to update tasks.md) that cannot be reconstructed from prior knowledge — omitting it loses the per-task constraints. Only pass false for follow-up state-polling calls within the same run, after the instruction has already been read and acted on."
    ),
});

export async function applyChangeTool(
  input: z.input<typeof applyChangeInputSchema>
): Promise<string> {
  const includeInstruction = input.includeInstruction ?? true;

  return runTool("apply-change", { includeInstruction }, async () => {
    const target = await resolveProposalTarget({
      folderId: input.folderId,
      changeId: input.changeName,
    });
    return {
      target,
      ...(await loadApplyState(target.worktreePath, input.changeName)),
    };
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
