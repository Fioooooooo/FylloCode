import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "../utils/state";
import { listChanges, computeStatus } from "../openspec-runtime";
import { validateTargetPath } from "../utils/project-root";

const exploreInputSchema = z.object({
  changeName: z
    .string()
    .optional()
    .describe(
      "Name of a specific change to inspect. Omit to get an overview of all active changes."
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
      "Defaults to true; keep true on the first call. The instruction text encodes the explore workflow contract (how to interpret active changes, when to escalate to create-proposal, what counts as enough investigation) that cannot be reconstructed from prior knowledge. Only pass false for follow-up state-polling calls within the same run, after the instruction has already been read and acted on."
    ),
});

export async function exploreTool(input: z.infer<typeof exploreInputSchema>): Promise<string> {
  return runTool("explore", { includeInstruction: input.includeInstruction }, async () => {
    const result = validateTargetPath(input.targetPath);
    if (!result.ok) {
      const error = new Error(
        result.rawOutput ? `${result.error}\n\n${result.rawOutput}` : result.error
      );
      error.name = "InvalidTargetPath";
      throw error;
    }

    const projectRoot = result.resolved;
    const activeChanges = await listChanges(projectRoot);
    const currentChange = input.changeName
      ? await computeStatus(projectRoot, input.changeName)
      : null;
    return {
      projectRoot,
      activeChanges,
      currentChange,
    };
  });
}

export function registerExploreTool(server: McpServer): void {
  server.registerTool(
    "explore",
    {
      description:
        "Enter explore mode - a thinking partner for exploring ideas, investigating problems, and clarifying requirements. Use when the user wants to think through something before or during a change.",
      inputSchema: exploreInputSchema,
    },
    async (input) => {
      return {
        content: [
          {
            type: "text" as const,
            text: await exploreTool(input),
          },
        ],
      };
    }
  );
}
