import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  MissingEnvError,
  traceLineageByCommit,
  traceLineageByFile,
  traceLineageByProposal,
  type LineageResponseDto,
} from "../utils/lineage-reader";

const lineageInputSchema = z
  .object({
    mode: z.enum(["trace-proposal", "trace-commit", "trace-file"]),
    changeId: z.string().optional(),
    commitHash: z.string().optional(),
    filePath: z.string().optional(),
    lineRange: z.string().optional(),
  })
  .strict()
  .refine(
    (input) => {
      if (input.mode === "trace-proposal") {
        return typeof input.changeId === "string" && input.changeId.length > 0;
      }
      if (input.mode === "trace-commit") {
        return typeof input.commitHash === "string" && input.commitHash.length > 0;
      }
      return typeof input.filePath === "string" && input.filePath.length > 0;
    },
    {
      message:
        "trace-proposal requires changeId, trace-commit requires commitHash, trace-file requires filePath",
    }
  );

type LineageInput = z.infer<typeof lineageInputSchema>;
type LineageResponse = { content: [{ type: "text"; text: string }] };

function formatResult(result: LineageResponseDto | LineageResponseDto[] | null): string {
  if (result === null) return "null";
  return JSON.stringify(result, null, 2);
}

export async function handleLineage(input: LineageInput): Promise<LineageResponse> {
  try {
    let result: LineageResponseDto | LineageResponseDto[] | null;

    if (input.mode === "trace-proposal") {
      result = await traceLineageByProposal(input.changeId as string);
    } else if (input.mode === "trace-commit") {
      result = await traceLineageByCommit(input.commitHash as string);
    } else {
      result = await traceLineageByFile(input.filePath as string, input.lineRange);
    }

    return {
      content: [{ type: "text", text: formatResult(result) }],
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
      description: [
        "Retrieve the design history behind code changes — the task, chat session, and proposal artifacts (proposal.md, design.md, tasks.md) that explain *why* code was written the way it is.",
        "",
        "Use this tool when the user asks about design rationale, decision context, or the motivation behind existing code. It surfaces the full deliberation chain that produced a change, which git commit messages alone do not capture.",
        "",
        "Modes:",
        "- trace-file (preferred for 'why' questions): given a file path (and optional line range), finds all commits that touched the file and returns the lineage entries that originated from FylloCode sessions. This is the easiest entry point — no need to know a commit hash upfront.",
        "- trace-commit: given a full Git SHA, returns the lineage entry for that specific commit.",
        "- trace-proposal: given an OpenSpec change ID, returns the lineage entry for that proposal.",
      ].join("\n"),
      inputSchema: lineageInputSchema,
    },
    handleLineage
  );
}
