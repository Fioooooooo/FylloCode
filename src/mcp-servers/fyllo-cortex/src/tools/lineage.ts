import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  traceLineageByCommit,
  traceLineageByFile,
  traceLineageByProposal,
  type LineageTraceDto,
} from "../utils/lineage-reader";

const lineageInputSchema = z
  .object({
    mode: z.enum(["trace-proposal", "trace-commit", "trace-file"]),
    folderId: z.string().min(1),
    worktreePath: z.string().optional(),
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

function formatResult(result: LineageTraceDto | LineageTraceDto[]): string {
  return JSON.stringify(result, null, 2);
}

export async function handleLineage(input: LineageInput): Promise<LineageResponse> {
  try {
    let result: LineageTraceDto | LineageTraceDto[];

    if (input.mode === "trace-proposal") {
      result = await traceLineageByProposal(
        input.folderId,
        input.changeId as string,
        input.worktreePath
      );
    } else if (input.mode === "trace-commit") {
      result = await traceLineageByCommit(
        input.folderId,
        input.commitHash as string,
        input.worktreePath
      );
    } else {
      result = await traceLineageByFile(
        input.folderId,
        input.filePath as string,
        input.lineRange,
        input.worktreePath
      );
    }

    return {
      content: [{ type: "text", text: formatResult(result) }],
    };
  } catch (error) {
    const candidate = error as { code?: string; details?: unknown };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: {
                type: candidate.code ?? (error instanceof Error ? error.name : "UnknownError"),
                message: error instanceof Error ? error.message : String(error),
                ...(candidate.details ? { details: candidate.details } : {}),
              },
            },
            null,
            2
          ),
        },
      ],
    };
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
        "All modes require an authorized folderId. Optional worktreePath must be a registered worktree for that Folder; filePath remains repository-relative.",
        "- trace-file (preferred for 'why' questions): given a file path (and optional line range), finds all commits that touched the file and returns repository origin/references plus active-Workspace subject details.",
        "- trace-commit: given a full Git SHA, returns the lineage entry for that specific commit.",
        "- trace-proposal: given an OpenSpec change ID, returns the lineage entry for that proposal.",
      ].join("\n"),
      inputSchema: lineageInputSchema,
    },
    handleLineage
  );
}
