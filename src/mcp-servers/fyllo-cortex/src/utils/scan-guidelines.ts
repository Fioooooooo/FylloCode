import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import type { GuidelineEntry } from "../types/guideline";
import { parseFrontmatter } from "./frontmatter";

type RecursiveDirent = Dirent & {
  parentPath?: string;
  path?: string;
};

function isEnoentError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function guidelinePath(guidelinesRoot: string, entry: RecursiveDirent): string {
  const parentPath = entry.parentPath ?? entry.path ?? guidelinesRoot;
  const absolutePath = path.join(parentPath, entry.name);
  return path.relative(path.dirname(guidelinesRoot), absolutePath).replace(/\\/g, "/");
}

function summarizeReadError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type GuidelineMetadata = Pick<GuidelineEntry, "name" | "description" | "keywords"> & {
  parseError?: string;
};

export function extractGuidelineMetadata(content: string, fallbackName: string): GuidelineMetadata {
  const { data, parseError } = parseFrontmatter(content);

  const metadata: GuidelineMetadata = {
    name: nonEmptyString(data?.name) ?? fallbackName,
    description: nonEmptyString(data?.description),
    keywords: stringArray(data?.keywords),
  };

  if (parseError) {
    metadata.parseError = parseError;
  }

  return metadata;
}

async function buildGuidelineEntry(
  guidelinesRoot: string,
  entry: RecursiveDirent
): Promise<GuidelineEntry> {
  const relativePath = guidelinePath(guidelinesRoot, entry);
  const absolutePath = path.join(path.dirname(guidelinesRoot), relativePath);
  const stem = path.basename(entry.name, ".md");

  let content: string;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch (error) {
    return {
      path: relativePath,
      name: stem,
      description: null,
      keywords: null,
      parseError: summarizeReadError(error),
    };
  }

  return { path: relativePath, ...extractGuidelineMetadata(content, stem) };
}

export async function scanGuidelines(projectRoot: string): Promise<GuidelineEntry[]> {
  const guidelinesRoot = path.join(projectRoot, "guidelines");
  let entries: RecursiveDirent[];

  try {
    entries = await readdir(guidelinesRoot, { withFileTypes: true, recursive: true });
  } catch (error) {
    if (isEnoentError(error)) {
      return [];
    }

    throw error;
  }

  const guidelines = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && path.extname(entry.name) === ".md")
      .map((entry) => buildGuidelineEntry(guidelinesRoot, entry))
  );

  return guidelines.sort((left, right) => {
    if (left.path < right.path) {
      return -1;
    }
    if (left.path > right.path) {
      return 1;
    }
    return 0;
  });
}
