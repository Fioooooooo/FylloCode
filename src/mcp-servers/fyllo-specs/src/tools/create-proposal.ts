import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import path from "path";
import { z } from "zod";
import type { McpProposalEvent } from "@shared/types/mcp-event";
import type { ResolvedProposalTarget } from "@shared/types/proposal";
import { getMcpEventDir, getSessionId } from "../../../shared/env";
import { resolveSingleFolder, resolveWorkspace } from "../../../shared/workspace-resolver";
import { runTool } from "../utils/state";
import { createChange, computeStatus, getInstructions } from "../runtime-openspec";
import { findProposalTarget, prepareProposalWorkspace } from "../runtime-workspace";

const createProposalInputSchema = z.object({
  changeName: z
    .string()
    .describe(
      "Kebab-case name for the change (e.g. 'add-user-auth'). Derive this from the user's intent before calling — ask the user what they want to build first if it isn't already clear."
    ),
  folderId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Owner Folder ID. Required for multi-root Workspace activations; may be omitted when exactly one Folder is authorized."
    ),
  worktreeMode: z
    .enum(["linked", "main"])
    .optional()
    .default("linked")
    .describe(
      'Whether to prepare this proposal in a linked worktree or directly in the owner repository main worktree. Defaults to "linked"; pass "main" only when the user explicitly requests main worktree work.'
    ),
  includeInstruction: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Defaults to true; keep true on the first call. The instruction text encodes the artifact contract (required granularity, file paths / function & type names / reuse points / acceptance criteria, template structure) that cannot be reconstructed from prior knowledge — omitting it produces under-specified artifacts. Only pass false for follow-up state-polling calls within the same run, after the instruction has already been read and acted on."
    ),
});

async function writeProposalEvent(target: ResolvedProposalTarget): Promise<void> {
  const workspace = resolveWorkspace();
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
    workspaceId: workspace.workspaceId,
    proposalRef: target.proposalRef,
    worktreeMode: target.worktreeMode,
    worktreePath: target.worktreePath,
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
  const worktreeMode = input.worktreeMode ?? "linked";

  return runTool("create-proposal", { includeInstruction }, async () => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.changeName)) {
      throw new Error("changeName must be kebab-case");
    }
    const owner = resolveSingleFolder(input.folderId);
    const proposalRef = { folderId: owner.folderId, changeId: input.changeName };
    const existingTarget = await findProposalTarget(proposalRef);
    if (existingTarget) {
      return {
        changeName: input.changeName,
        status: "failed",
        target: existingTarget,
        error: {
          code: "PROPOSAL_ALREADY_EXISTS",
          message: `Proposal already exists: ${input.changeName}`,
        },
      };
    }

    const { workspace, warnings } = await prepareProposalWorkspace({
      folderId: owner.folderId,
      folderPath: owner.folderPath,
      changeName: input.changeName,
      worktreeMode,
    });
    const projectRoot = workspace.path;
    const target = {
      proposalRef,
      worktreeMode: workspace.mode,
      worktreePath: workspace.path,
    };
    await createChange(projectRoot, input.changeName);
    await writeProposalEvent(target);

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
      target,
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
