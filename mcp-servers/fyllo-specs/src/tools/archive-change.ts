import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "../utils/state";
import { archiveChange, changeDir } from "../openspec-runtime";
import { resolveProjectRoot } from "../utils/project-root";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const archiveChangeInputSchema = z.object({
  changeName: z.string().describe("Name of the change to archive."),
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
      "Set to false to omit the skill instruction text and return only the state JSON. Useful when the agent already knows the workflow."
    ),
});

export async function archiveChangeTool(
  input: z.infer<typeof archiveChangeInputSchema>
): Promise<string> {
  return runTool("archive-change", { includeInstruction: input.includeInstruction }, async () => {
    const projectRoot = resolveProjectRoot();
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
