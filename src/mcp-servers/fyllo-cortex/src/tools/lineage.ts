import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  MissingEnvError,
  traceLineageByCommit,
  traceLineageByProposal,
  type LineageResponseDto,
} from "../utils/lineage-reader";

const traceProposalInputSchema = z
  .object({
    mode: z.literal("trace-proposal"),
    changeId: z.string().min(1),
  })
  .strict();

const traceCommitInputSchema = z
  .object({
    mode: z.literal("trace-commit"),
    commitHash: z.string().min(1),
  })
  .strict();

const lineageInputSchema = z.discriminatedUnion("mode", [
  traceProposalInputSchema,
  traceCommitInputSchema,
]);

type LineageInput = z.infer<typeof lineageInputSchema>;
type LineageResponse = { content: [{ type: "text"; text: string }] };

export async function handleLineage(input: LineageInput): Promise<LineageResponse> {
  try {
    let result: LineageResponseDto | null;

    if (input.mode === "trace-proposal") {
      result = await traceLineageByProposal(input.changeId);
    } else {
      result = await traceLineageByCommit(input.commitHash);
    }

    return {
      content: [{ type: "text", text: result === null ? "null" : JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    if (error instanceof MissingEnvError) {
      throw error;
    }
    return { content: [{ type: "text", text: "null" }] };
  }
}

export function registerLineageTool(server: McpServer): void {
  server.registerTool(
    "lineage",
    {
      description:
        "Trace lineage by proposal changeId or commit hash. Returns the subject's origin, task summary, sessions, and proposals with their status. Use mode=trace-proposal with changeId to look up by OpenSpec change ID, or mode=trace-commit with commitHash to look up by full commit SHA.",
      inputSchema: lineageInputSchema,
    },
    handleLineage
  );
}
