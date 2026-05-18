import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTool } from "../utils/state";
import { createChange, computeStatus, getInstructions } from "../openspec-runtime";
import { resolveProjectRoot } from "../utils/project-root";

const createProposalInputSchema = z.object({
  changeName: z
    .string()
    .describe(
      "Kebab-case name for the change (e.g. 'add-user-auth'). Derive this from the user's intent before calling — ask the user what they want to build first if it isn't already clear."
    ),
  includeInstruction: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Set to false to omit the skill instruction text and return only the state JSON. Useful when the agent already knows the workflow."
    ),
});

export async function createProposalTool(
  input: z.infer<typeof createProposalInputSchema>
): Promise<string> {
  return runTool("create-proposal", { includeInstruction: input.includeInstruction }, async () => {
    const projectRoot = resolveProjectRoot();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.changeName)) {
      throw new Error("changeName must be kebab-case");
    }
    await createChange(projectRoot, input.changeName);

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
      schemaName: status.schemaName,
      applyRequires: status.applyRequires,
      artifacts,
      template: nextArtifact?.template ?? null,
      instruction: nextArtifact?.instruction ?? null,
      nextArtifact: nextArtifact?.id ?? null,
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
