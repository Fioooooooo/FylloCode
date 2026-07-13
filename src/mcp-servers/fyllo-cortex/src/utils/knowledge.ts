import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { dump, load } from "js-yaml";
import {
  knowledgeEntryDraftSchema,
  knowledgeEntryNameSchema,
  projectRelativePathSchema,
  sha256Schema,
} from "@shared/schemas/knowledge";
import type {
  KnowledgeAnchor,
  KnowledgeComputedStatus,
  KnowledgeEntryDraft,
  KnowledgeEntryFrontmatter,
} from "@shared/types/knowledge";

// 匹配 knowledge entry 的 YAML frontmatter，允许可选的 BOM 与 CRLF 换行。
const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const DEFAULT_URL_MAX_AGE_DAYS = 90;

export interface KnowledgeIndexEntry extends KnowledgeEntryDraft {
  path: string;
  contentHash: string;
  status: KnowledgeComputedStatus;
  statusDetails: KnowledgeAnchorStatusDetail[];
}

export interface KnowledgeIndexError {
  path: string;
  type: "read" | "parse";
  message: string;
}

export interface KnowledgeIndex {
  entries: KnowledgeIndexEntry[];
  errors: KnowledgeIndexError[];
}

export interface KnowledgeAnchorStatusDetail {
  anchor: KnowledgeAnchor;
  status: KnowledgeComputedStatus;
  reason?: string;
}

export interface KnowledgeAnchorStatusResult {
  status: KnowledgeComputedStatus;
  details: KnowledgeAnchorStatusDetail[];
}

export interface WriteKnowledgeEntryOptions {
  overwrite?: boolean;
  expectedContentHash?: string;
}

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

// 对普通对象按键排序后序列化，使相同内容的 pnpm-lock 解析结果得到稳定哈希。
function toStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableJsonValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, toStableJsonValue(item)])
  );
}

export function sha256StableJson(value: unknown): string {
  return sha256(JSON.stringify(toStableJsonValue(value)) ?? "null");
}

function assertKnowledgeFilePath(knowledgeRoot: string, name: string): string {
  const parsedName = knowledgeEntryNameSchema.safeParse(name);
  if (!parsedName.success) {
    throw new Error("invalid knowledge entry name");
  }

  const resolvedRoot = path.resolve(knowledgeRoot);
  const filePath = path.resolve(resolvedRoot, `${parsedName.data}.md`);
  if (!filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("invalid knowledge entry path");
  }

  return filePath;
}

function normalizeTimestamp(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`;
  }

  return value;
}

function inferAnchorKind(anchor: Record<string, unknown>): Record<string, unknown> {
  if (typeof anchor.kind === "string") {
    return anchor;
  }

  const candidates = [
    typeof anchor.file === "string" && typeof anchor.hash === "string" ? "file" : null,
    typeof anchor.package === "string" &&
    typeof anchor.version === "string" &&
    typeof anchor.resolutionDigest === "string"
      ? "package"
      : null,
    typeof anchor.url === "string" && "verifiedAt" in anchor ? "url" : null,
  ].filter((kind): kind is KnowledgeAnchor["kind"] => kind !== null);

  if (candidates.length !== 1) {
    return anchor;
  }

  return {
    kind: candidates[0],
    ...anchor,
  };
}

function normalizeAnchor(anchor: unknown): unknown {
  if (!isPlainObject(anchor)) {
    return anchor;
  }

  const normalized = inferAnchorKind({ ...anchor });
  if ("verifiedAt" in normalized) {
    normalized.verifiedAt = normalizeTimestamp(normalized.verifiedAt);
  }
  if (typeof normalized.maxAgeDays === "string" && /^\d+$/.test(normalized.maxAgeDays)) {
    normalized.maxAgeDays = Number(normalized.maxAgeDays);
  }
  return normalized;
}

function normalizeKnowledgeFrontmatter(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...raw,
    createdAt: normalizeTimestamp(raw.createdAt),
    updatedAt: normalizeTimestamp(raw.updatedAt),
    asOf: normalizeTimestamp(raw.asOf),
  };

  if (Array.isArray(raw.anchors)) {
    normalized.anchors = raw.anchors.map(normalizeAnchor);
  }

  return normalized;
}

function parseKnowledgeMarkdown(content: string): KnowledgeEntryDraft {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    throw new Error("knowledge entry frontmatter is missing");
  }

  const loaded = load(match[1] ?? "");
  if (!isPlainObject(loaded)) {
    throw new Error("knowledge entry frontmatter must be an object");
  }

  const body = content.slice(match[0].length);
  const parsed = knowledgeEntryDraftSchema.safeParse({
    ...normalizeKnowledgeFrontmatter(loaded),
    body,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  return parsed.data;
}

function frontmatterFor(entry: KnowledgeEntryDraft): KnowledgeEntryFrontmatter {
  const frontmatter: KnowledgeEntryFrontmatter = {
    name: entry.name,
    description: entry.description,
    type: entry.type,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
  if (entry.asOf) {
    frontmatter.asOf = entry.asOf;
  }
  if (entry.anchors) {
    frontmatter.anchors = entry.anchors;
  }
  if (entry.source) {
    frontmatter.source = entry.source;
  }
  return frontmatter;
}

export function serializeKnowledgeEntry(entry: KnowledgeEntryDraft): string {
  const parsed = knowledgeEntryDraftSchema.safeParse(entry);
  if (!parsed.success) {
    throw new Error(`invalid knowledge entry: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }

  const yaml = dump(frontmatterFor(parsed.data), {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trimEnd();
  return ["---", yaml, "---", parsed.data.body.trimEnd(), ""].join("\n");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }
    throw error;
  }
}

// 原子写入 knowledge entry：先写唯一命名的临时文件再 rename，避免并发读写看到半成品。
// expectedContentHash 用于 update 时的乐观并发控制，防止覆盖用户或另一轮会话的写入。
export async function writeKnowledgeEntry(
  knowledgeRoot: string,
  entry: KnowledgeEntryDraft,
  options: WriteKnowledgeEntryOptions = {}
): Promise<{ path: string; contentHash: string }> {
  const filePath = assertKnowledgeFilePath(knowledgeRoot, entry.name);
  await mkdir(path.dirname(filePath), { recursive: true });

  const exists = await fileExists(filePath);
  if (exists && !options.overwrite && !options.expectedContentHash) {
    throw new Error(`knowledge entry already exists: ${entry.name}`);
  }

  if (options.expectedContentHash) {
    const parsedHash = sha256Schema.safeParse(options.expectedContentHash);
    if (!parsedHash.success) {
      throw new Error("invalid expected content hash");
    }

    if (!exists) {
      throw new Error(`knowledge entry does not exist: ${entry.name}`);
    }

    const current = await readFile(filePath);
    const currentHash = sha256(current);
    if (currentHash !== parsedHash.data) {
      throw new Error(`knowledge entry hash mismatch: ${entry.name}`);
    }
  }

  const content = serializeKnowledgeEntry(entry);
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`
  );

  try {
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }

  return {
    path: path.relative(knowledgeRoot, filePath).replace(/\\/g, "/"),
    contentHash: sha256(content),
  };
}

async function buildKnowledgeIndexEntry(
  knowledgeRoot: string,
  projectRoot: string | undefined,
  filename: string
): Promise<{ entry?: KnowledgeIndexEntry; error?: KnowledgeIndexError }> {
  const filePath = path.join(knowledgeRoot, filename);

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    return {
      error: {
        path: filename,
        type: "read",
        message: summarizeError(error),
      },
    };
  }

  try {
    const parsed = parseKnowledgeMarkdown(content);
    if (filename !== `${parsed.name}.md`) {
      throw new Error(`knowledge entry filename does not match frontmatter name: ${parsed.name}`);
    }

    const status = projectRoot
      ? await computeKnowledgeAnchorStatus(projectRoot, parsed.anchors)
      : { status: "unknown" as const, details: [] };

    return {
      entry: {
        ...parsed,
        path: filename,
        contentHash: sha256(content),
        status: status.status,
        statusDetails: status.details,
      },
    };
  } catch (error) {
    return {
      error: {
        path: filename,
        type: "parse",
        message: summarizeError(error),
      },
    };
  }
}

export async function readKnowledgeIndex(
  knowledgeRoot: string,
  projectRoot?: string
): Promise<KnowledgeIndex> {
  let filenames: string[];
  try {
    const entries = await readdir(knowledgeRoot, { withFileTypes: true });
    filenames = entries
      .filter((entry) => entry.isFile() && path.extname(entry.name) === ".md")
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (isEnoent(error)) {
      return { entries: [], errors: [] };
    }
    throw error;
  }

  const index: KnowledgeIndex = { entries: [], errors: [] };
  const seenNames = new Set<string>();

  for (const filename of filenames) {
    const result = await buildKnowledgeIndexEntry(knowledgeRoot, projectRoot, filename);
    if (result.error) {
      index.errors.push(result.error);
      continue;
    }

    if (!result.entry) {
      continue;
    }

    if (seenNames.has(result.entry.name)) {
      index.errors.push({
        path: filename,
        type: "parse",
        message: `duplicate knowledge entry name: ${result.entry.name}`,
      });
      continue;
    }

    seenNames.add(result.entry.name);
    index.entries.push(result.entry);
  }

  index.entries.sort((left, right) => {
    if (left.name !== right.name) {
      return left.name.localeCompare(right.name);
    }
    return left.path.localeCompare(right.path);
  });

  return index;
}

function combineStatuses(details: KnowledgeAnchorStatusDetail[]): KnowledgeComputedStatus {
  if (details.length === 0) {
    return "active";
  }
  if (details.some((detail) => detail.status === "unknown")) {
    return "unknown";
  }
  if (details.some((detail) => detail.status === "suspect")) {
    return "suspect";
  }
  return "active";
}

function resolveProjectRelativePath(projectRoot: string, relativePath: string): string | null {
  const parsedPath = projectRelativePathSchema.safeParse(relativePath);
  if (!parsedPath.success) {
    return null;
  }

  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, parsedPath.data);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  return resolved;
}

async function computeFileAnchorStatus(
  projectRoot: string,
  anchor: Extract<KnowledgeAnchor, { kind: "file" }>
): Promise<KnowledgeAnchorStatusDetail> {
  const filePath = resolveProjectRelativePath(projectRoot, anchor.file);
  if (!filePath) {
    return { anchor, status: "unknown", reason: "invalid file path" };
  }

  try {
    const content = await readFile(filePath);
    return {
      anchor,
      status: sha256(content) === anchor.hash ? "active" : "suspect",
    };
  } catch (error) {
    return {
      anchor,
      status: "unknown",
      reason: summarizeError(error),
    };
  }
}

function packageKeyMatches(key: string, anchor: Extract<KnowledgeAnchor, { kind: "package" }>) {
  const suffix = `${anchor.package}@${anchor.version}`;
  return key === suffix || key.endsWith(`/${suffix}`) || key.includes(suffix);
}

async function computePackageAnchorStatus(
  projectRoot: string,
  anchor: Extract<KnowledgeAnchor, { kind: "package" }>
): Promise<KnowledgeAnchorStatusDetail> {
  try {
    const lockContent = await readFile(path.join(projectRoot, "pnpm-lock.yaml"), "utf8");
    const parsed = load(lockContent);
    const packages =
      isPlainObject(parsed) && isPlainObject(parsed.packages) ? parsed.packages : null;
    if (!packages) {
      return { anchor, status: "unknown", reason: "pnpm-lock.yaml packages map is missing" };
    }

    const match = Object.entries(packages).find(([key]) => packageKeyMatches(key, anchor));
    if (!match) {
      return { anchor, status: "unknown", reason: "package resolution entry is missing" };
    }

    const resolutionDigest = sha256StableJson(match[1]);
    return {
      anchor,
      status: resolutionDigest === anchor.resolutionDigest ? "active" : "suspect",
    };
  } catch (error) {
    return {
      anchor,
      status: "unknown",
      reason: summarizeError(error),
    };
  }
}

function computeUrlAnchorStatus(
  anchor: Extract<KnowledgeAnchor, { kind: "url" }>,
  now: Date
): KnowledgeAnchorStatusDetail {
  const verifiedAt = Date.parse(anchor.verifiedAt);
  if (!Number.isFinite(verifiedAt)) {
    return { anchor, status: "unknown", reason: "invalid verifiedAt" };
  }

  const maxAgeMs = (anchor.maxAgeDays ?? DEFAULT_URL_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
  const ageMs = now.getTime() - verifiedAt;
  return {
    anchor,
    status: ageMs <= maxAgeMs ? "active" : "suspect",
  };
}

export async function computeKnowledgeAnchorStatus(
  projectRoot: string,
  anchors: KnowledgeAnchor[] | undefined,
  options: { now?: Date } = {}
): Promise<KnowledgeAnchorStatusResult> {
  if (!anchors || anchors.length === 0) {
    return { status: "active", details: [] };
  }

  const now = options.now ?? new Date();
  const details: KnowledgeAnchorStatusDetail[] = [];

  for (const anchor of anchors) {
    if (anchor.kind === "file") {
      details.push(await computeFileAnchorStatus(projectRoot, anchor));
    } else if (anchor.kind === "package") {
      details.push(await computePackageAnchorStatus(projectRoot, anchor));
    } else {
      details.push(computeUrlAnchorStatus(anchor, now));
    }
  }

  return {
    status: combineStatuses(details),
    details,
  };
}
