import { randomUUID } from "crypto";
import { extname, isAbsolute, relative, sep } from "path";
import type {
  ConfirmLocalFilePreviewInput,
  LocalFilePreviewDocument,
  LocalFilePreviewErrorResult,
  LocalFilePreviewRequest,
  LocalFilePreviewResult,
} from "@shared/types/local-file-preview";
import {
  canonicalizeLocalPath,
  inspectLocalFile,
  LocalTextFileError,
  readLocalTextFile,
  resolveLocalFileTarget,
  type LocalFileMetadata,
  type LocalTextFileSnapshot,
  type ResolvedLocalFileTarget,
} from "@main/infra/files/local-text-file";
import {
  listRegisteredWorktreePaths,
  type RegisteredWorktreeResult,
} from "@main/infra/git/worktree-reader";

const AUTHORIZATION_TTL_MS = 60_000;

export interface LocalFilePreviewSender {
  id: number;
  once(event: "destroyed", listener: () => void): unknown;
}

export interface LocalFilePreviewContext {
  workspaceId: string;
  folderPath: string;
  sender: LocalFilePreviewSender;
}

interface PendingAuthorization {
  authorizationId: string;
  webContentsId: number;
  workspaceId: string;
  requestedPath: string;
  canonicalPath: string;
  size: number;
  mtimeMs: number;
  line?: number;
  column?: number;
  expiresAt: number;
}

export interface LocalFilePreviewServiceDependencies {
  canonicalizePath: (path: string) => Promise<string>;
  resolveTarget: (requestedPath: string) => Promise<ResolvedLocalFileTarget>;
  inspectFile: (canonicalPath: string) => Promise<LocalFileMetadata>;
  readFile: (canonicalPath: string) => Promise<LocalTextFileSnapshot>;
  listWorktrees: (folderPath: string) => Promise<RegisteredWorktreeResult>;
  createAuthorizationId: () => string;
  now: () => number;
}

const defaultDependencies: LocalFilePreviewServiceDependencies = {
  canonicalizePath: canonicalizeLocalPath,
  resolveTarget: resolveLocalFileTarget,
  inspectFile: inspectLocalFile,
  readFile: readLocalTextFile,
  listWorktrees: listRegisteredWorktreePaths,
  createAuthorizationId: randomUUID,
  now: Date.now,
};

const languageByExtension: Record<string, string> = {
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  css: "css",
  go: "go",
  h: "c",
  hpp: "cpp",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  markdown: "markdown",
  mdown: "markdown",
  mkdn: "markdown",
  mkd: "markdown",
  mdwn: "markdown",
  mdtxt: "markdown",
  mdtext: "markdown",
  mjs: "javascript",
  py: "python",
  rs: "rust",
  sh: "shell",
  sql: "sql",
  ts: "typescript",
  tsx: "typescript",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

function languageForPath(path: string): string {
  return languageByExtension[extname(path).slice(1).toLowerCase()] ?? "plaintext";
}

function isWithinRoot(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return (
    pathFromRoot === "" ||
    (!isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`))
  );
}

function grantKey(workspaceId: string, canonicalPath: string): string {
  return `${workspaceId}\0${canonicalPath}`;
}

function errorResult(
  error: unknown,
  requestedPath?: string,
  canonicalPath?: string
): LocalFilePreviewErrorResult {
  if (error instanceof LocalTextFileError) {
    return {
      status: "error",
      code: error.code,
      message: error.message,
      requestedPath,
      canonicalPath,
    };
  }
  return {
    status: "error",
    code: "READ_FAILED",
    message: error instanceof Error ? error.message : String(error),
    requestedPath,
    canonicalPath,
  };
}

function authorizationError(
  message: string,
  requestedPath?: string,
  canonicalPath?: string
): LocalFilePreviewErrorResult {
  return {
    status: "error",
    code: "AUTHORIZATION_INVALID",
    message,
    requestedPath,
    canonicalPath,
  };
}

export class LocalFilePreviewService {
  private readonly dependencies: LocalFilePreviewServiceDependencies;
  private readonly rememberedGrants = new Map<number, Set<string>>();
  private readonly pendingAuthorizations = new Map<string, PendingAuthorization>();
  private readonly observedSenders = new Set<number>();

  constructor(dependencies: Partial<LocalFilePreviewServiceDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  async preparePreview(
    input: LocalFilePreviewRequest,
    context: LocalFilePreviewContext
  ): Promise<LocalFilePreviewResult> {
    this.observeSender(context.sender);
    this.pruneExpiredAuthorizations();

    let target: ResolvedLocalFileTarget;
    try {
      target = await this.dependencies.resolveTarget(input.requestedPath);
    } catch (error: unknown) {
      return errorResult(error, input.requestedPath);
    }

    try {
      const trustedRoots = await this.getTrustedRoots(context.folderPath);
      const remembered = this.rememberedGrants
        .get(context.sender.id)
        ?.has(grantKey(context.workspaceId, target.canonicalPath));
      if (remembered || trustedRoots.some((root) => isWithinRoot(root, target.canonicalPath))) {
        return await this.readReadyResult(target);
      }

      const authorizationId = this.dependencies.createAuthorizationId();
      const pending: PendingAuthorization = {
        authorizationId,
        webContentsId: context.sender.id,
        workspaceId: context.workspaceId,
        requestedPath: input.requestedPath,
        canonicalPath: target.canonicalPath,
        size: target.size,
        mtimeMs: target.mtimeMs,
        line: target.line,
        column: target.column,
        expiresAt: this.dependencies.now() + AUTHORIZATION_TTL_MS,
      };
      this.pendingAuthorizations.set(authorizationId, pending);

      return {
        status: "confirmation-required",
        authorizationId,
        requestedPath: input.requestedPath,
        canonicalPath: target.canonicalPath,
        size: target.size,
        mtimeMs: target.mtimeMs,
        line: target.line,
        column: target.column,
      };
    } catch (error: unknown) {
      return errorResult(error, input.requestedPath, target.canonicalPath);
    }
  }

  async confirmPreview(
    input: ConfirmLocalFilePreviewInput,
    context: LocalFilePreviewContext
  ): Promise<LocalFilePreviewResult> {
    this.observeSender(context.sender);
    this.pruneExpiredAuthorizations();

    const pending = this.pendingAuthorizations.get(input.authorizationId);
    this.pendingAuthorizations.delete(input.authorizationId);
    if (!pending) {
      return authorizationError("预览授权不存在或已过期");
    }
    if (
      pending.webContentsId !== context.sender.id ||
      pending.workspaceId !== context.workspaceId ||
      pending.expiresAt <= this.dependencies.now()
    ) {
      return authorizationError(
        "预览授权与当前窗口或 Workspace 不匹配",
        pending.requestedPath,
        pending.canonicalPath
      );
    }

    try {
      const metadata = await this.dependencies.inspectFile(pending.canonicalPath);
      if (metadata.size !== pending.size || metadata.mtimeMs !== pending.mtimeMs) {
        return {
          status: "error",
          code: "FILE_CHANGED",
          message: "文件在确认前已发生变化，请重新打开链接",
          requestedPath: pending.requestedPath,
          canonicalPath: pending.canonicalPath,
        };
      }

      const target: ResolvedLocalFileTarget = {
        requestedPath: pending.requestedPath,
        canonicalPath: pending.canonicalPath,
        size: pending.size,
        mtimeMs: pending.mtimeMs,
        line: pending.line,
        column: pending.column,
      };
      const ready = await this.readReadyResult(target);
      if (ready.status !== "ready") {
        return ready;
      }

      if (ready.document.size !== pending.size || ready.document.mtimeMs !== pending.mtimeMs) {
        return {
          status: "error",
          code: "FILE_CHANGED",
          message: "文件在确认前已发生变化，请重新打开链接",
          requestedPath: pending.requestedPath,
          canonicalPath: pending.canonicalPath,
        };
      }

      if (input.rememberForWindow) {
        const grants = this.rememberedGrants.get(context.sender.id) ?? new Set<string>();
        grants.add(grantKey(context.workspaceId, pending.canonicalPath));
        this.rememberedGrants.set(context.sender.id, grants);
      }
      return ready;
    } catch (error: unknown) {
      return errorResult(error, pending.requestedPath, pending.canonicalPath);
    }
  }

  cleanupSender(webContentsId: number): void {
    this.rememberedGrants.delete(webContentsId);
    this.observedSenders.delete(webContentsId);
    for (const [authorizationId, pending] of this.pendingAuthorizations) {
      if (pending.webContentsId === webContentsId) {
        this.pendingAuthorizations.delete(authorizationId);
      }
    }
  }

  private async getTrustedRoots(folderPath: string): Promise<string[]> {
    const folderRoot = await this.dependencies.canonicalizePath(folderPath);
    let worktreePaths: string[] = [];
    try {
      worktreePaths = (await this.dependencies.listWorktrees(folderPath)).paths;
    } catch {
      // Git probe failures safely fall back to the current Folder root only.
    }
    const canonicalWorktrees = await Promise.all(
      worktreePaths.map((worktreePath) =>
        this.dependencies.canonicalizePath(worktreePath).catch(() => null)
      )
    );
    return [
      ...new Set([
        folderRoot,
        ...canonicalWorktrees.filter((path): path is string => Boolean(path)),
      ]),
    ];
  }

  private async readReadyResult(target: ResolvedLocalFileTarget): Promise<LocalFilePreviewResult> {
    try {
      const snapshot = await this.dependencies.readFile(target.canonicalPath);
      const document: LocalFilePreviewDocument = {
        requestedPath: target.requestedPath,
        canonicalPath: snapshot.canonicalPath,
        content: snapshot.content,
        language: languageForPath(snapshot.canonicalPath),
        size: snapshot.size,
        mtimeMs: snapshot.mtimeMs,
        line: target.line,
        column: target.column,
      };
      return { status: "ready", document };
    } catch (error: unknown) {
      return errorResult(error, target.requestedPath, target.canonicalPath);
    }
  }

  private observeSender(sender: LocalFilePreviewSender): void {
    if (this.observedSenders.has(sender.id)) return;
    this.observedSenders.add(sender.id);
    sender.once("destroyed", () => {
      this.cleanupSender(sender.id);
    });
  }

  private pruneExpiredAuthorizations(): void {
    const now = this.dependencies.now();
    for (const [authorizationId, pending] of this.pendingAuthorizations) {
      if (pending.expiresAt <= now) {
        this.pendingAuthorizations.delete(authorizationId);
      }
    }
  }
}

export const localFilePreviewService = new LocalFilePreviewService();
