import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { GuidelineEntry } from "../types/guideline";
import { loadPrompt } from "../utils/load-prompt";
import { resolveProjectRoot } from "../utils/project-root";
import { extractGuidelineMetadata, scanGuidelines } from "../utils/scan-guidelines";

const guidelinesInputSchema = z
  .object({
    mode: z
      .enum(["init", "create", "update"])
      .describe(
        "init: bootstrap guidelines for a project that has none. create: add a new guideline document for an unwritten convention. update: repair an existing document that is stale or conflicts with repository facts."
      ),
    topic: z
      .string()
      .optional()
      .describe(
        "Required for mode=create: topic name for the new document (e.g. 'Testing', 'ErrorHandling')."
      ),
    path: z
      .string()
      .optional()
      .describe(
        "Required for mode=update: project-relative path of the target document (e.g. 'guidelines/Testing.md')."
      ),
    reason: z
      .string()
      .optional()
      .describe(
        "create/update: one sentence on what triggered this maintenance (user correction, fact conflict, new convention)."
      ),
    includeInstruction: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Defaults to true; keep true on the first call so the scenario instruction is returned. Pass false only for follow-up state re-checks within the same session."
      ),
  })
  .strict()
  .refine(
    (input) => {
      if (input.mode === "create") {
        return typeof input.topic === "string" && input.topic.trim().length > 0;
      }
      if (input.mode === "update") {
        return typeof input.path === "string" && input.path.trim().length > 0;
      }
      return true;
    },
    { message: "mode=create requires topic, mode=update requires path" }
  );

type GuidelinesInput = z.infer<typeof guidelinesInputSchema>;
type GuidelinesResponse = { content: [{ type: "text"; text: string }] };

type AgentsFileState = {
  path: string;
  exists: boolean;
  hasGuidelinesIndex: boolean;
};

type TargetState = {
  path: string;
  exists: boolean;
  name: string | null;
  description: string | null;
  keywords: string[] | null;
  parseError?: string;
};

// 检查 AGENTS.md 是否已链接到 guidelines 目录，用于 init/create 模式给出修复建议。
const AGENTS_GUIDELINES_LINK_RE = /\]\(guidelines\/[^)]+\.md\)/;

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readAgentsFileState(projectRoot: string): Promise<AgentsFileState> {
  try {
    const content = await readFile(path.join(projectRoot, "AGENTS.md"), "utf8");
    return {
      path: "AGENTS.md",
      exists: true,
      hasGuidelinesIndex: AGENTS_GUIDELINES_LINK_RE.test(content),
    };
  } catch {
    return { path: "AGENTS.md", exists: false, hasGuidelinesIndex: false };
  }
}

function normalizeTargetPath(requested: string): string {
  const normalized = path.normalize(requested).split(path.sep).join("/");
  if (
    path.isAbsolute(requested) ||
    !normalized.startsWith("guidelines/") ||
    !normalized.endsWith(".md")
  ) {
    const error = new Error(
      "path must be a project-relative markdown file under guidelines/ (e.g. 'guidelines/Testing.md')"
    );
    error.name = "InvalidTargetPath";
    throw error;
  }
  return normalized;
}

async function readTargetState(projectRoot: string, requested: string): Promise<TargetState> {
  const relativePath = normalizeTargetPath(requested);
  const stem = path.basename(relativePath, ".md");

  let content: string;
  try {
    content = await readFile(path.join(projectRoot, relativePath), "utf8");
  } catch (error) {
    if (isEnoent(error)) {
      return { path: relativePath, exists: false, name: null, description: null, keywords: null };
    }
    return {
      path: relativePath,
      exists: true,
      name: stem,
      description: null,
      keywords: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }

  return { path: relativePath, exists: true, ...extractGuidelineMetadata(content, stem) };
}

async function buildGuidelinesState(input: GuidelinesInput): Promise<object> {
  const projectRoot = resolveProjectRoot();
  const guidelines: GuidelineEntry[] = await scanGuidelines(projectRoot);
  const base = {
    mode: input.mode,
    guidelinesRoot: "guidelines",
    ...(input.reason ? { reason: input.reason } : {}),
    guidelines,
  };

  if (input.mode === "update") {
    return { ...base, target: await readTargetState(projectRoot, input.path as string) };
  }

  return {
    ...base,
    ...(input.mode === "create" ? { topic: input.topic } : {}),
    agentsFile: await readAgentsFileState(projectRoot),
  };
}

function wrapState(instruction: string, state: unknown): string {
  return `<tool_instruction>\n${instruction}\n</tool_instruction>\n\n<state>\n${JSON.stringify(state, null, 2)}\n</state>`;
}

export async function handleGuidelines(input: GuidelinesInput): Promise<GuidelinesResponse> {
  const includeInstruction = input.includeInstruction ?? true;

  let state: object;
  try {
    state = await buildGuidelinesState(input);
  } catch (error) {
    state = {
      errors: [
        {
          type: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const text = includeInstruction
    ? wrapState(loadPrompt(`guidelines-${input.mode}`), state)
    : JSON.stringify(state, null, 2);

  return { content: [{ type: "text", text }] };
}

export function registerGuidelinesTool(server: McpServer): void {
  server.registerTool(
    "guidelines",
    {
      description:
        "Maintain the project's repository guidelines (guidelines/**/*.md). Call when: the user asks to bootstrap guidelines for a project that has none (mode=init); you discover an unwritten convention future agents must follow (mode=create); the user corrects your understanding of a project convention, or a guideline is stale or conflicts with repository facts (mode=update). Returns the current guidelines state plus scenario-specific authoring instructions. Do NOT call this tool to read guidelines — the index is injected into your session as a <guidelines> block, and documents are read directly via their paths.",
      inputSchema: guidelinesInputSchema,
    },
    handleGuidelines
  );
}
