import { promises as fs } from "fs";
import path from "path";
import { dump, load } from "js-yaml";
import { sessionPlansDir } from "@main/infra/storage/project-paths";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import type { PlanDocument, PlanDocumentStatus } from "@shared/types/lineage";

const fullPlanSlugPattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;

type ParsedPlan = {
  document: PlanDocument;
  frontmatter: {
    slug: string;
    goal: string;
    createdAt: string;
    status: PlanDocumentStatus;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlanStatus(value: unknown): value is PlanDocumentStatus {
  return value === "draft" || value === "approved";
}

function normalizeYamlTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function assertSafePathSegment(value: string, label: string): void {
  if (
    value.length === 0 ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes(".") ||
    /\s/.test(value)
  ) {
    throw ipcError(IpcErrorCodes.VALIDATION_ERROR, `${label} is not a safe path segment`);
  }
}

function assertPlanSlug(slug: string): void {
  assertSafePathSegment(slug, "slug");
  if (!fullPlanSlugPattern.test(slug)) {
    throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "slug must match yyyy-MM-dd-agent-slug");
  }
}

function planPath(projectPath: string, sessionId: string, slug: string): string {
  assertSafePathSegment(sessionId, "sessionId");
  assertPlanSlug(slug);

  const dir = sessionPlansDir(projectPath, sessionId);
  const filePath = path.join(dir, `${slug}.md`);
  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(filePath);
  if (path.dirname(resolvedFile) !== resolvedDir) {
    throw ipcError(IpcErrorCodes.VALIDATION_ERROR, "plan path escapes the session plans dir");
  }
  return filePath;
}

function parsePlanMarkdown(markdown: string, expectedSlug: string): ParsedPlan {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) {
    throw ipcError(IpcErrorCodes.PLAN_INVALID, "Plan frontmatter is missing");
  }

  const parsed = load(match[1] ?? "");
  if (!isRecord(parsed)) {
    throw ipcError(IpcErrorCodes.PLAN_INVALID, "Plan frontmatter must be an object");
  }

  const { slug, goal, createdAt, status } = parsed;
  const normalizedCreatedAt = normalizeYamlTimestamp(createdAt);
  if (
    typeof slug !== "string" ||
    typeof goal !== "string" ||
    normalizedCreatedAt === null ||
    !isPlanStatus(status)
  ) {
    throw ipcError(IpcErrorCodes.PLAN_INVALID, "Plan frontmatter is invalid");
  }

  if (slug !== expectedSlug) {
    throw ipcError(IpcErrorCodes.PLAN_INVALID, "Plan slug does not match requested slug");
  }

  const body = markdown.slice(match[0].length);
  const frontmatter = { slug, goal, createdAt: normalizedCreatedAt, status };
  return {
    frontmatter,
    document: {
      ...frontmatter,
      body,
    },
  };
}

function serializePlan(frontmatter: ParsedPlan["frontmatter"], body: string): string {
  const yaml = dump(frontmatter, { lineWidth: -1, noRefs: true }).trimEnd();
  return ["---", yaml, "---", body].join("\n");
}

async function readPlanFile(filePath: string, slug: string): Promise<ParsedPlan> {
  try {
    return parsePlanMarkdown(await fs.readFile(filePath, "utf8"), slug);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw ipcError(IpcErrorCodes.PLAN_NOT_FOUND, `Plan not found: ${slug}`);
    }
    throw error;
  }
}

async function writePlanFile(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error: unknown) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export async function readPlan(
  projectPath: string,
  sessionId: string,
  slug: string
): Promise<PlanDocument> {
  const filePath = planPath(projectPath, sessionId, slug);
  return (await readPlanFile(filePath, slug)).document;
}

export async function savePlanBody(
  projectPath: string,
  sessionId: string,
  slug: string,
  body: string
): Promise<PlanDocument> {
  const filePath = planPath(projectPath, sessionId, slug);
  const parsed = await readPlanFile(filePath, slug);
  await writePlanFile(filePath, serializePlan(parsed.frontmatter, body));
  return readPlan(projectPath, sessionId, slug);
}

export async function approvePlan(
  projectPath: string,
  sessionId: string,
  slug: string
): Promise<PlanDocument> {
  const filePath = planPath(projectPath, sessionId, slug);
  const parsed = await readPlanFile(filePath, slug);
  await writePlanFile(
    filePath,
    serializePlan({ ...parsed.frontmatter, status: "approved" }, parsed.document.body)
  );
  return readPlan(projectPath, sessionId, slug);
}
