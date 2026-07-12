import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { knowledgeEntryNameSchema } from "@shared/schemas/knowledge";
import type { KnowledgeEntryDocument } from "@shared/types/knowledge";
import { ipcError } from "@main/ipc/_kit/errors";
import { knowledgeDir } from "@main/infra/storage/project-paths";

export interface SaveKnowledgeEntryInput {
  name: string;
  content: string;
}

export interface KnowledgeDocumentServiceOptions {
  knowledgeRoot?: string;
}

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function parseKnowledgeEntryName(name: string): string {
  const result = knowledgeEntryNameSchema.safeParse(name);
  if (!result.success) {
    throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "Invalid knowledge entry name");
  }

  return result.data;
}

function resolveKnowledgeEntryPath(knowledgeRoot: string, name: string): string {
  const parsedName = parseKnowledgeEntryName(name);
  const resolvedRoot = path.resolve(knowledgeRoot);
  const filePath = path.resolve(resolvedRoot, `${parsedName}.md`);
  if (!filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "Invalid knowledge entry path");
  }

  return filePath;
}

function entryNotFound(name: string): Error {
  return ipcError(IpcErrorCodes.KNOWLEDGE_ENTRY_NOT_FOUND, `Knowledge entry not found: ${name}`);
}

export async function readKnowledgeEntry(
  projectPath: string,
  name: string,
  options: KnowledgeDocumentServiceOptions = {}
): Promise<KnowledgeEntryDocument> {
  const filePath = resolveKnowledgeEntryPath(
    options.knowledgeRoot ?? knowledgeDir(projectPath),
    name
  );

  try {
    return {
      name: parseKnowledgeEntryName(name),
      content: await readFile(filePath, "utf8"),
    };
  } catch (error) {
    if (isEnoent(error)) {
      throw entryNotFound(name);
    }
    throw error;
  }
}

export async function saveKnowledgeEntry(
  projectPath: string,
  input: SaveKnowledgeEntryInput,
  options: KnowledgeDocumentServiceOptions = {}
): Promise<KnowledgeEntryDocument> {
  const root = options.knowledgeRoot ?? knowledgeDir(projectPath);
  const name = parseKnowledgeEntryName(input.name);
  const filePath = resolveKnowledgeEntryPath(root, name);
  await mkdir(root, { recursive: true });

  const tempPath = path.join(root, `.${name}.${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, input.content, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }

  return {
    name,
    content: input.content,
  };
}
