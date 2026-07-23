import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import path from "path";
import { z } from "zod";
import type { McpProposalEvent } from "@shared/types/mcp-event";
import { getMcpEventDir, getProjectPath, getSessionId } from "../../../shared/env";
import { runTool } from "../utils/state";
import { createChange, computeStatus, getInstructions } from "../runtime-openspec";
import { validateTargetPath } from "../utils/project-root";
import { prepareProposalWorkspace } from "../runtime-workspace";

const createProposalInputSchema = z.object({
  changeName: z
    .string()
    .describe(
      "Kebab-case name for the change (e.g. 'add-user-auth'). Derive this from the user's intent before calling — ask the user what they want to build first if it isn't already clear."
    ),
  targetPath: z.string().min(1).describe("Absolute path to the main project root."),
  workspaceMode: z
    .enum(["linked", "main"])
    .optional()
    .default("linked")
    .describe(
      'Whether to prepare this proposal in a linked worktree or directly in the main workspace. Defaults to "linked"; pass "main" only when the user explicitly requests main workspace work.'
    ),
  includeInstruction: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Defaults to true; keep true on the first call. The instruction text encodes the artifact contract (required granularity, file paths / function & type names / reuse points / acceptance criteria, template structure) that cannot be reconstructed from prior knowledge — omitting it produces under-specified artifacts. Only pass false for follow-up state-polling calls within the same run, after the instruction has already been read and acted on."
    ),
});

async function writeProposalEvent(changeName: string): Promise<void> {
  const eventDir = getMcpEventDir();
  const sessionId = getSessionId();
  if (!eventDir || !sessionId) {
    return;
  }

  const createdAt = new Date().toISOString();
  const fileName = `${Date.now()}-${nanoid()}.json`;
  const filePath = path.join(eventDir, fileName);
  const tempPath = path.join(eventDir, `${fileName}.${process.pid}.tmp`);
  const event: McpProposalEvent = {
    server: "fyllo-specs",
    tool: "create-proposal",
    createdAt,
    sessionId,
    changeId: changeName,
  };

  try {
    await fs.mkdir(eventDir, { recursive: true });
    await fs.writeFile(tempPath, JSON.stringify(event, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error: unknown) {
    await fs.unlink(tempPath).catch(() => undefined);
    console.warn("[fyllo-specs] failed to write create-proposal event", error);
  }
}

export async function createProposalTool(
  input: z.input<typeof createProposalInputSchema>
): Promise<string> {
  const includeInstruction = input.includeInstruction ?? true;
  const workspaceMode = input.workspaceMode ?? "linked";

  return runTool("create-proposal", { includeInstruction }, async () => {
    const result = validateTargetPath(input.targetPath);
    if (!result.ok) {
      const error = new Error(
        result.rawOutput ? `${result.error}\n\n${result.rawOutput}` : result.error
      );
      error.name = "InvalidTargetPath";
      throw error;
    }

    const mainProjectPath = result.resolved!;
    const expectedMainPath = path.resolve(getProjectPath());
    if (mainProjectPath !== expectedMainPath) {
      throw new Error("targetPath must be the main project root for create-proposal");
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.changeName)) {
      throw new Error("changeName must be kebab-case");
    }
    const { workspace, warnings } = await prepareProposalWorkspace({
      mainProjectPath,
      changeName: input.changeName,
      workspaceMode,
    });
    const projectRoot = workspace.path;
    await createChange(projectRoot, input.changeName);
    await writeProposalEvent(input.changeName);

    const status = await computeStatus(projectRoot, input.changeName);
    if (!status) {
      throw new Error(`Change not found: ${input.changeName}`);
    }
    const artifacts = await Promise.all(
      status.artifacts.map(async (artifact) => ({
        ...artifact,
        ...(await getInstructions(projectRoot, input.changeName, artifact.id)),
      }))
    );
    const nextArtifact = artifacts.find((artifact) => artifact.status !== "done") ?? null;
    return {
      changeName: input.changeName,
      workspace,
      schemaName: status.schemaName,
      applyRequires: status.applyRequires,
      artifacts,
      template: nextArtifact?.template ?? null,
      instruction: nextArtifact?.instruction ?? null,
      nextArtifact: nextArtifact?.id ?? null,
      warnings,
    };
  });
}

export function registerCreateProposalTool(server: McpServer): void {
  server.registerTool(
    "create-proposal",
    {
      description:
        "Propose a new change with all artifacts generated in one step. Use when the user wants to quickly describe what they want to build and get a complete proposal with design, specs, and tasks ready for implementation. Before calling, confirm the user's intent and derive a kebab-case `changeName` from it (e.g. 'add user authentication' → 'add-user-auth').",
      inputSchema: createProposalInputSchema,
    },
    async (input) => {
      return {
        content: [{ type: "text" as const, text: await createProposalTool(input) }],
      };
    }
  );
}
