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
import type { ResolvedWorkspaceFolder } from "@shared/types/workspace";
import logger from "@main/infra/logger";

const AUTHORIZATION_TTL_MS = 60_000;

export interface LocalFilePreviewSender {
  id: number;
  once(event: "destroyed", listener: () => void): unknown;
}

export interface LocalFilePreviewContext {
  workspaceId: string;
  availableFolders: ResolvedWorkspaceFolder[];
  sessionId?: string;
  sender: LocalFilePreviewSender;
}

interface TrustedRoot {
  canonicalPath: string;
  folderId: string;
  worktreePath: string;
}

interface PendingAuthorization {
  authorizationId: string;
  webContentsId: number;
  workspaceId: string;
  sessionId?: string;
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
      const trustedRoots = await this.getTrustedRoots(context.availableFolders);
      const owner = this.resolveOwner(trustedRoots, target.canonicalPath);
      const remembered = this.rememberedGrants
        .get(context.sender.id)
        ?.has(grantKey(context.workspaceId, target.canonicalPath));
      if (remembered || owner) {
        return await this.readReadyResult(target, owner);
      }

      const authorizationId = this.dependencies.createAuthorizationId();
      const pending: PendingAuthorization = {
        authorizationId,
        webContentsId: context.sender.id,
        workspaceId: context.workspaceId,
        sessionId: context.sessionId,
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
      pending.sessionId !== context.sessionId ||
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

  hasPendingWorkspaceDispatch(workspaceId: string): boolean {
    this.pruneExpiredAuthorizations();
    return [...this.pendingAuthorizations.values()].some(
      (pending) => pending.workspaceId === workspaceId
    );
  }

  private async getTrustedRoots(folders: ResolvedWorkspaceFolder[]): Promise<TrustedRoot[]> {
    const roots = await Promise.all(
      folders.map(async (folder): Promise<TrustedRoot[]> => {
        let folderRoot: string;
        try {
          folderRoot = await this.dependencies.canonicalizePath(folder.folderPath);
        } catch (error: unknown) {
          logger.warn("[local-file-preview] excluding Folder whose root cannot be canonicalized", {
            folderId: folder.folderId,
            folderPath: folder.folderPath,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        }

        let worktreePaths: string[] = [];
        try {
          worktreePaths = (await this.dependencies.listWorktrees(folder.folderPath)).paths;
        } catch (error: unknown) {
          logger.warn("[local-file-preview] linked worktree discovery failed", {
            folderId: folder.folderId,
            folderPath: folder.folderPath,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        const canonicalWorktrees = await Promise.all(
          worktreePaths.map(async (worktreePath): Promise<TrustedRoot | null> => {
            try {
              return {
                canonicalPath: await this.dependencies.canonicalizePath(worktreePath),
                folderId: folder.folderId,
                worktreePath,
              };
            } catch (error: unknown) {
              logger.warn("[local-file-preview] excluding non-canonical linked worktree", {
                folderId: folder.folderId,
                worktreePath,
                error: error instanceof Error ? error.message : String(error),
              });
              return null;
            }
          })
        );

        return [
          { canonicalPath: folderRoot, folderId: folder.folderId, worktreePath: folder.folderPath },
          ...canonicalWorktrees.filter((root): root is TrustedRoot => root !== null),
        ];
      })
    );

    const byIdentity = new Map<string, TrustedRoot>();
    for (const root of roots.flat()) {
      byIdentity.set(`${root.folderId}\0${root.canonicalPath}`, root);
    }
    return [...byIdentity.values()];
  }

  private resolveOwner(
    trustedRoots: TrustedRoot[],
    canonicalTarget: string
  ): LocalFilePreviewDocument["owner"] {
    const best = trustedRoots
      .filter((root) => isWithinRoot(root.canonicalPath, canonicalTarget))
      .sort((left, right) => right.canonicalPath.length - left.canonicalPath.length)[0];
    return best ? { folderId: best.folderId, worktreePath: best.worktreePath } : undefined;
  }

  private async readReadyResult(
    target: ResolvedLocalFileTarget,
    owner?: LocalFilePreviewDocument["owner"]
  ): Promise<LocalFilePreviewResult> {
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
        owner,
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
