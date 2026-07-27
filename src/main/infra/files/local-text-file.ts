import { promises as fs } from "fs";
import type { Stats } from "fs";
import {
  LOCAL_FILE_PREVIEW_MAX_BYTES,
  type LocalFilePreviewErrorCode,
  type LocalFilePreviewLocation,
} from "@shared/types/local-file-preview";

export interface LocalFileMetadata {
  canonicalPath: string;
  size: number;
  mtimeMs: number;
}

export interface ResolvedLocalFileTarget extends LocalFileMetadata, LocalFilePreviewLocation {
  requestedPath: string;
}

export interface LocalTextFileSnapshot extends LocalFileMetadata {
  content: string;
}

export class LocalTextFileError extends Error {
  constructor(
    readonly code: LocalFilePreviewErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "LocalTextFileError";
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function toReadError(error: unknown, targetPath: string): LocalTextFileError {
  if (error instanceof LocalTextFileError) {
    return error;
  }
  const code = errorCode(error);
  if (code === "ENOENT" || code === "ENOTDIR") {
    return new LocalTextFileError("FILE_NOT_FOUND", `文件不存在：${targetPath}`, {
      cause: error,
    });
  }
  if (code === "EACCES" || code === "EPERM") {
    return new LocalTextFileError("PERMISSION_DENIED", `没有权限读取文件：${targetPath}`, {
      cause: error,
    });
  }
  return new LocalTextFileError("READ_FAILED", `无法读取文件：${targetPath}`, {
    cause: error,
  });
}

function assertSupportedMetadata(stats: Stats, targetPath: string): void {
  if (!stats.isFile()) {
    throw new LocalTextFileError("NOT_REGULAR_FILE", `只支持预览普通文件：${targetPath}`);
  }
  if (stats.size > LOCAL_FILE_PREVIEW_MAX_BYTES) {
    throw new LocalTextFileError("FILE_TOO_LARGE", `文件超过 5 MiB 预览上限：${targetPath}`);
  }
}

async function inspectCanonicalFile(canonicalPath: string): Promise<LocalFileMetadata> {
  let handle;
  try {
    handle = await fs.open(canonicalPath, "r");
    const stats = await handle.stat();
    assertSupportedMetadata(stats, canonicalPath);
    return {
      canonicalPath,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    };
  } catch (error: unknown) {
    throw toReadError(error, canonicalPath);
  } finally {
    await handle?.close();
  }
}

async function resolveExistingTarget(
  requestedPath: string,
  location: LocalFilePreviewLocation = {}
): Promise<ResolvedLocalFileTarget | null> {
  try {
    const canonicalPath = await fs.realpath(requestedPath);
    const metadata = await inspectCanonicalFile(canonicalPath);
    return { requestedPath, ...metadata, ...location };
  } catch (error: unknown) {
    const code = errorCode(error);
    if (
      code === "ENOENT" ||
      code === "ENOTDIR" ||
      (error instanceof LocalTextFileError && error.code === "FILE_NOT_FOUND")
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * 完整路径优先；只有完整名称不存在时才解释末尾 :line[:column]。
 * 贪婪捕获路径部分可避开 Windows drive letter，同时保留文件名中的其他冒号。
 */
function splitSourceLocation(
  requestedPath: string
): { path: string; line: number; column?: number } | null {
  const lineAndColumn = /^(.*):([1-9]\d*):([1-9]\d*)$/.exec(requestedPath);
  if (lineAndColumn?.[1] && lineAndColumn[2] && lineAndColumn[3]) {
    return {
      path: lineAndColumn[1],
      line: Number(lineAndColumn[2]),
      column: Number(lineAndColumn[3]),
    };
  }

  const lineOnly = /^(.*):([1-9]\d*)$/.exec(requestedPath);
  if (!lineOnly?.[1] || !lineOnly[2]) return null;
  return {
    path: lineOnly[1],
    line: Number(lineOnly[2]),
  };
}

export async function resolveLocalFileTarget(
  requestedPath: string
): Promise<ResolvedLocalFileTarget> {
  const exact = await resolveExistingTarget(requestedPath);
  if (exact) return exact;

  const located = splitSourceLocation(requestedPath);
  if (located) {
    const resolved = await resolveExistingTarget(located.path, {
      line: located.line,
      column: located.column,
    });
    if (resolved) {
      return { ...resolved, requestedPath };
    }
  }

  throw new LocalTextFileError("FILE_NOT_FOUND", `文件不存在：${requestedPath}`);
}

export async function inspectLocalFile(canonicalPath: string): Promise<LocalFileMetadata> {
  return inspectCanonicalFile(canonicalPath);
}

export function canonicalizeLocalPath(path: string): Promise<string> {
  return fs.realpath(path);
}

export async function readLocalTextFile(canonicalPath: string): Promise<LocalTextFileSnapshot> {
  let handle;
  try {
    handle = await fs.open(canonicalPath, "r");
    const stats = await handle.stat();
    assertSupportedMetadata(stats, canonicalPath);

    const buffer = Buffer.allocUnsafe(LOCAL_FILE_PREVIEW_MAX_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > LOCAL_FILE_PREVIEW_MAX_BYTES) {
      throw new LocalTextFileError("FILE_TOO_LARGE", `文件超过 5 MiB 预览上限：${canonicalPath}`);
    }

    const contentBytes = buffer.subarray(0, offset);
    if (contentBytes.includes(0)) {
      throw new LocalTextFileError("BINARY_FILE", `文件包含二进制内容：${canonicalPath}`);
    }

    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(contentBytes);
    } catch (error: unknown) {
      throw new LocalTextFileError("INVALID_UTF8", `文件不是有效的 UTF-8 文本：${canonicalPath}`, {
        cause: error,
      });
    }

    return {
      canonicalPath,
      content: content.replace(/^\uFEFF/, ""),
      size: offset,
      mtimeMs: stats.mtimeMs,
    };
  } catch (error: unknown) {
    throw toReadError(error, canonicalPath);
  } finally {
    await handle?.close();
  }
}
