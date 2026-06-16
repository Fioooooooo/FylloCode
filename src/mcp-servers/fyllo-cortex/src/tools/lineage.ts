import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  MissingEnvError,
  traceLineageByCommit,
  traceLineageByProposal,
  type LineageResponseDto,
} from "../utils/lineage-reader";

const lineageInputSchema = z
  .object({
    mode: z.enum(["trace-proposal", "trace-commit"]),
    changeId: z.string().optional(),
    commitHash: z.string().optional(),
  })
  .strict()
  .refine(
    (input) => {
      if (input.mode === "trace-proposal") {
        return typeof input.changeId === "string" && input.changeId.length > 0;
      }
      return typeof input.commitHash === "string" && input.commitHash.length > 0;
    },
    {
      message: "trace-proposal requires changeId, trace-commit requires commitHash",
    }
  );

type LineageInput = z.infer<typeof lineageInputSchema>;
type LineageResponse = { content: [{ type: "text"; text: string }] };

export async function handleLineage(input: LineageInput): Promise<LineageResponse> {
  try {
    let result: LineageResponseDto | null;

    if (input.mode === "trace-proposal") {
      result = await traceLineageByProposal(input.changeId as string);
    } else {
      result = await traceLineageByCommit(input.commitHash as string);
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
        "Trace the origin of a commit or proposal. Given a `changeId` (OpenSpec change ID) or `commitHash` (full Git SHA), returns the chat session, task, and proposal chain that produced it, including each proposal's status (`pending`/`applying`/`completed`) and filesystem path. The `proposalPath` points to a directory containing the agreed-upon design and task list produced during the Chat stage (e.g., `proposal.md`, `design.md`, `tasks.md`). Use this to answer 'where did this change come from' or 'what was the context for this commit'.",
      inputSchema: lineageInputSchema,
    },
    handleLineage
  );
}
