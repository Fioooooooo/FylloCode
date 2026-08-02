import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "../utils/state";
import { listWorkspaceChanges, computeStatus } from "../runtime-openspec";
import { resolveProposalTarget } from "../runtime-workspace";

class ProposalOwnerError extends Error {
  constructor(
    public readonly code:
      "PROPOSAL_OWNER_AMBIGUOUS" | "PROPOSAL_OWNER_UNVERIFIED" | "PROPOSAL_NOT_FOUND",
    message: string,
    public readonly details: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "ProposalOwnerError";
  }
}

const exploreInputSchema = z.object({
  changeName: z
    .string()
    .optional()
    .describe(
      "Name of a specific change to inspect. Omit to get an overview of all active changes."
    ),
  folderId: z
    .string()
    .min(1)
    .optional()
    .describe("Folder owner to scan. Omit to aggregate all authorized descriptor Folders."),
  includeInstruction: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Defaults to true; keep true on the first call. The instruction text encodes the explore workflow contract (how to interpret active changes, when to escalate to create-proposal, what counts as enough investigation) that cannot be reconstructed from prior knowledge. Only pass false for follow-up state-polling calls within the same run, after the instruction has already been read and acted on."
    ),
});

export async function exploreTool(input: z.input<typeof exploreInputSchema>): Promise<string> {
  const includeInstruction = input.includeInstruction ?? true;

  return runTool("explore", { includeInstruction }, async () => {
    const { activeChanges, warnings } = await listWorkspaceChanges(input.folderId);

    let currentChange = null;
    if (input.changeName) {
      const matches = activeChanges.filter((change) => change.changeId === input.changeName);
      if (!input.folderId && warnings.length > 0) {
        throw new ProposalOwnerError(
          "PROPOSAL_OWNER_UNVERIFIED",
          "Proposal owner cannot be proven while one or more Folder scans failed",
          { changeName: input.changeName, warnings }
        );
      }
      if (matches.length > 1) {
        throw new ProposalOwnerError(
          "PROPOSAL_OWNER_AMBIGUOUS",
          `Proposal exists in multiple authorized Folders: ${input.changeName}`,
          {
            candidates: matches.map((change) => ({
              folderId: change.folderId,
              changeId: change.changeId,
            })),
          }
        );
      }
      const match = matches[0];
      if (!match) {
        throw new ProposalOwnerError(
          "PROPOSAL_NOT_FOUND",
          `Proposal not found: ${input.changeName}`,
          {
            changeName: input.changeName,
            ...(input.folderId ? { folderId: input.folderId } : {}),
          }
        );
      }
      const target = await resolveProposalTarget({
        folderId: match.folderId,
        changeId: match.changeId,
      });
      currentChange = {
        ...target,
        ...(await computeStatus(target.worktreePath, input.changeName)),
      };
    }

    return {
      activeChanges,
      currentChange,
      warnings,
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
