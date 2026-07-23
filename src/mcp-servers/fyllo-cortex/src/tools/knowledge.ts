import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { knowledgeEntryNameSchema } from "@shared/schemas/knowledge";
import type { KnowledgeAnchor, KnowledgeEntryType, KnowledgeSource } from "@shared/types/knowledge";
import { getProjectDataDir } from "../../../shared/env";
import { loadPrompt } from "../utils/load-prompt";
import { resolveProjectRoot } from "../utils/project-root";
import {
  readKnowledgeIndex,
  sha256,
  type KnowledgeAnchorStatusDetail,
  type KnowledgeIndex,
  type KnowledgeIndexEntry,
  type KnowledgeIndexError,
} from "../utils/knowledge";

const knowledgeInputSchema = z
  .object({
    mode: z
      .enum(["capture", "update", "retire", "audit"])
      .describe(
        "capture: draft entries from user-selected flags. update: revise an existing entry. retire: remove an obsolete entry. audit: inspect stale/unknown entries."
      ),
    name: knowledgeEntryNameSchema
      .optional()
      .describe("Required for mode=update and mode=retire: target knowledge entry name."),
    reason: z
      .string()
      .min(1)
      .optional()
      .describe("Required for mode=update and mode=retire: why this maintenance is needed."),
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
      if (input.mode === "update" || input.mode === "retire") {
        return Boolean(input.name && input.reason);
      }
      return true;
    },
    { message: "mode=update and mode=retire require name and reason" }
  );

type KnowledgeInput = z.infer<typeof knowledgeInputSchema>;
type KnowledgeResponse = { content: [{ type: "text"; text: string }] };

interface KnowledgeIndexEntryDto {
  path: string;
  name: string;
  description: string;
  type: KnowledgeEntryType;
  createdAt: string;
  updatedAt: string;
  asOf?: string;
  anchors?: KnowledgeAnchor[];
  source?: KnowledgeSource;
  status: KnowledgeIndexEntry["status"];
  statusDetails: KnowledgeAnchorStatusDetail[];
  contentHash: string;
}

interface KnowledgeIndexDto {
  entries: KnowledgeIndexEntryDto[];
  errors: KnowledgeIndexError[];
}

interface KnowledgeTargetState {
  name: string;
  exists: boolean;
  path?: string;
  content?: string;
  contentHash?: string;
  status?: KnowledgeIndexEntry["status"];
  statusDetails?: KnowledgeAnchorStatusDetail[];
  entry?: KnowledgeIndexEntryDto;
  parseError?: string;
}

function requireProjectDataDir(): string {
  const value = getProjectDataDir();
  if (!value) {
    const error = new Error("Missing required environment variable: FYLLO_PROJECT_DATA_DIR");
    error.name = "MissingEnvError";
    throw error;
  }
  return value;
}

function knowledgeRoot(): string {
  return path.join(requireProjectDataDir(), "knowledge");
}

function entryDto(entry: KnowledgeIndexEntry): KnowledgeIndexEntryDto {
  return {
    path: entry.path,
    name: entry.name,
    description: entry.description,
    type: entry.type,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    ...(entry.asOf ? { asOf: entry.asOf } : {}),
    ...(entry.anchors ? { anchors: entry.anchors } : {}),
    ...(entry.source ? { source: entry.source } : {}),
    status: entry.status,
    statusDetails: entry.statusDetails,
    contentHash: entry.contentHash,
  };
}

function indexDto(index: KnowledgeIndex): KnowledgeIndexDto {
  return {
    entries: index.entries.map(entryDto),
    errors: index.errors,
  };
}

// 粗略估算渲染后的 index token 数，用于 audit 模式下让 agent 决定是否需要分批处理。
function approximateTokenCount(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function targetFileName(name: string): string {
  return `${knowledgeEntryNameSchema.parse(name)}.md`;
}

async function readTargetState(
  root: string,
  name: string,
  index: KnowledgeIndex
): Promise<KnowledgeTargetState> {
  const fileName = targetFileName(name);
  const filePath = path.join(root, fileName);

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { name, exists: false };
    }
    return {
      name,
      exists: true,
      path: fileName,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }

  const entry = index.entries.find((item) => item.name === name);
  const parseError = index.errors.find((item) => item.path === fileName);
  const base = {
    name,
    exists: true,
    path: fileName,
    content,
    contentHash: sha256(content),
  };

  if (entry) {
    return {
      ...base,
      status: entry.status,
      statusDetails: entry.statusDetails,
      entry: entryDto(entry),
    };
  }

  return {
    ...base,
    ...(parseError ? { parseError: parseError.message } : {}),
  };
}

async function buildKnowledgeState(input: KnowledgeInput): Promise<object> {
  const root = knowledgeRoot();
  const index = await readKnowledgeIndex(root, resolveProjectRoot());
  const base = {
    mode: input.mode,
    knowledgeRoot: root,
    ...(input.reason ? { reason: input.reason } : {}),
    index: indexDto(index),
  };

  if (input.mode === "update" || input.mode === "retire") {
    return {
      ...base,
      target: await readTargetState(root, input.name as string, index),
    };
  }

  if (input.mode === "audit") {
    return {
      ...base,
      approximateRenderedIndexTokens: approximateTokenCount(indexDto(index)),
    };
  }

  return base;
}

function wrapState(instruction: string, state: unknown): string {
  return `<tool_instruction>\n${instruction}\n</tool_instruction>\n\n<state>\n${JSON.stringify(state, null, 2)}\n</state>`;
}

export async function handleKnowledge(input: KnowledgeInput): Promise<KnowledgeResponse> {
  const includeInstruction = input.includeInstruction ?? true;

  let state: object;
  try {
    state = await buildKnowledgeState(input);
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
    ? wrapState(loadPrompt(`knowledge-${input.mode}`), state)
    : JSON.stringify(state, null, 2);

  return { content: [{ type: "text", text }] };
}

export function registerKnowledgeTool(server: McpServer): void {
  server.registerTool(
    "knowledge",
    {
      description:
        "Maintain durable project knowledge stored in FylloCode app data. Use mode=capture only after the user confirms an inline knowledge.flag action or explicitly asks to capture durable knowledge; use mode=update or mode=retire when the user asks to revise or remove an entry; use mode=audit when the user asks to inspect stale, unknown, duplicate, or low-quality entries. The tool returns current state plus mode-specific authoring instructions. It does not write knowledge files directly.",
      inputSchema: knowledgeInputSchema,
    },
    handleKnowledge
  );
}
