import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "../utils/state";
import { archiveChange, changeDir } from "../runtime-openspec";
import { validateTargetPath } from "../utils/project-root";
import { finalizeArchiveWorkspace } from "../runtime-workspace";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  ArchiveGitOpResult,
  ArchiveGitStep,
  ArchiveWorkspaceRecovery,
} from "../runtime-workspace";

const commitMessageSchema = /^[a-z]+(?:-[a-z]+)*\([a-z0-9-]+\): .+/;

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
  commitMessage: z
    .string()
    .optional()
    .describe('Required when confirm is true. First line must match "type(scope): summary".'),
  includeInstruction: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Defaults to true; keep true on the first call of a run. The instruction text encodes the archive workflow contract (sync → archive → commit ordering, conflict handling, commit-message format, reporting requirements) that cannot be reconstructed from prior knowledge — omitting it risks reordered or partial archive operations. Only pass false for follow-up state-polling calls within the same run, after the instruction has already been read and acted on."
    ),
});

function emptyWorkspace(projectRoot: string): {
  mode: "main";
  path: string;
  ok: boolean;
  gitOps: [];
  failedStep: null;
  recovery: ArchiveWorkspaceRecovery;
} {
  return {
    mode: "main",
    path: projectRoot,
    ok: true,
    gitOps: [],
    failedStep: null,
    recovery: {
      required: "none",
      kind: "none",
      mainPath: projectRoot,
      workspacePath: projectRoot,
      mainBranch: null,
      proposalBranch: "",
      completedSteps: [],
      remainingSteps: [],
      instructions: [],
    },
  };
}

function invalidCommitMessageState(input: { changeName: string; projectRoot: string }): {
  changeName: string;
  status: "failed";
  archive: {
    ok: false;
    archiveTarget: null;
    archiveRawOutput: null;
    conflicts: [];
    incompleteTasks: number;
    error: {
      code: string;
      message: string;
      retryHint: string;
    };
  };
  workspace: {
    mode: "main";
    path: string;
    ok: false;
    gitOps: ArchiveGitOpResult[];
    failedStep: ArchiveGitStep | null;
    recovery: ArchiveWorkspaceRecovery;
  };
} {
  return {
    changeName: input.changeName,
    status: "failed",
    archive: {
      ok: false,
      archiveTarget: null,
      archiveRawOutput: null,
      conflicts: [],
      incompleteTasks: 0,
      error: {
        code: "invalid-commit-message",
        message: 'commitMessage is required and first line must match "type(scope): summary".',
        retryHint:
          'Call archive-change again with confirm: true and commitMessage like "feat(scope): summary".',
      },
    },
    workspace: {
      ...emptyWorkspace(input.projectRoot),
      ok: false,
    },
  };
}

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

    const projectRoot = validation.resolved!;
    const commitMessage = input.commitMessage?.split(/\r?\n/)[0] ?? "";
    if (input.confirm && !commitMessageSchema.test(commitMessage)) {
      return invalidCommitMessageState({ changeName: input.changeName, projectRoot });
    }

    const changeDirPath = changeDir(projectRoot, input.changeName);
    if (!existsSync(changeDirPath)) {
      throw new Error(`Change not found: ${input.changeName}`);
    }
    const tasksText = readFileSync(join(changeDirPath, "tasks.md"), "utf8");
    const incompleteTasks = tasksText
      .split("\n")
      .filter((line) => /^- \[ \]/.test(line.trimEnd())).length;

    let result;
    try {
      result = await archiveChange(projectRoot, input.changeName, {
        confirm: input.confirm,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        changeName: input.changeName,
        status: "failed",
        archive: {
          ok: false,
          archiveTarget: null,
          archiveRawOutput: null,
          conflicts: [],
          incompleteTasks,
          error: {
            code: "openspec-archive-failed",
            message,
            retryHint: "Resolve the OpenSpec archive failure, then call archive-change again.",
          },
        },
        workspace: {
          ...emptyWorkspace(projectRoot),
          gitOps: [],
        },
      };
    }

    const archiveState = {
      ok: result.conflicts.length === 0,
      archiveTarget: result.archiveTarget,
      archiveRawOutput: result.archiveRawOutput,
      conflicts: result.conflicts,
      incompleteTasks,
      ...(result.conflicts.length > 0
        ? {
            error: {
              code: "archive-target-conflict",
              message: `Archive target exists: ${result.conflicts.join(", ")}`,
              retryHint: "Rename or remove the conflicting archive target before retrying.",
            },
          }
        : {}),
    };

    if (!input.confirm) {
      return {
        changeName: result.changeName,
        status: archiveState.ok ? "done" : "failed",
        archive: archiveState,
        workspace: emptyWorkspace(projectRoot),
      };
    }

    if (!archiveState.ok) {
      return {
        changeName: result.changeName,
        status: "failed",
        archive: archiveState,
        workspace: emptyWorkspace(projectRoot),
      };
    }

    const workspace = await finalizeArchiveWorkspace({
      mainProjectPath: process.env.FYLLO_PROJECT_PATH ?? projectRoot,
      workspacePath: projectRoot,
      changeName: input.changeName,
      commitMessage: input.commitMessage ?? "",
    });

    return {
      changeName: result.changeName,
      status: workspace.ok ? "done" : "failed",
      archive: archiveState,
      workspace,
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
