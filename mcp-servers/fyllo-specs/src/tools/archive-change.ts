import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "../utils/state";
import { archiveChange, changeDir } from "../openspec-runtime";
import { validateTargetPath } from "../utils/project-root";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const archiveChangeInputSchema = z.object({
  changeName: z.string().describe("Name of the change to archive."),
  targetPath: z
    .string()
    .min(1)
    .describe("Absolute path to the project root or a registered git worktree."),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Set to true to perform the actual archive move. Omit (or false) to preview conflicts and completion status first."
    ),
  includeInstruction: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Defaults to true; keep true on the first call of a run. The instruction text encodes the archive workflow contract (sync → archive → commit ordering, conflict handling, commit-message format, reporting requirements) that cannot be reconstructed from prior knowledge — omitting it risks reordered or partial archive operations. Only pass false for follow-up state-polling calls within the same run, after the instruction has already been read and acted on."
    ),
});

export async function archiveChangeTool(
  input: z.infer<typeof archiveChangeInputSchema>
): Promise<string> {
  return runTool("archive-change", { includeInstruction: input.includeInstruction }, async () => {
    const validation = validateTargetPath(input.targetPath);
    if (!validation.ok) {
      const error = new Error(
        validation.rawOutput ? `${validation.error}\n\n${validation.rawOutput}` : validation.error
      );
      error.name = "InvalidTargetPath";
      throw error;
    }

    const projectRoot = validation.resolved;
    const changeDirPath = changeDir(projectRoot, input.changeName);
    if (!existsSync(changeDirPath)) {
      throw new Error(`Change not found: ${input.changeName}`);
    }
    const tasksText = readFileSync(join(changeDirPath, "tasks.md"), "utf8");
    const incompleteTasks = tasksText
      .split("\n")
      .filter((line) => /^- \[ \]/.test(line.trimEnd())).length;

    const result = await archiveChange(projectRoot, input.changeName, {
      confirm: input.confirm,
    });

    return {
      changeName: result.changeName,
      incompleteTasks,
      deltaSpecSummary: result.deltaSpecSummary,
      archiveTarget: result.archiveTarget,
      archiveRawOutput: result.archiveRawOutput,
      conflicts: result.conflicts,
      confirm: input.confirm,
    };
  });
}

export function registerArchiveChangeTool(server: McpServer): void {
  server.registerTool(
    "archive-change",
    {
      description:
        "Archive a completed change in the experimental workflow. Use when the user wants to finalize and archive a change after implementation is complete.",
      inputSchema: archiveChangeInputSchema,
    },
    async (input) => {
      return {
        content: [{ type: "text" as const, text: await archiveChangeTool(input) }],
      };
    }
  );
}
