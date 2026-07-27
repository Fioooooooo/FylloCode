export interface LocalFileLinkTarget {
  requestedPath: string;
}

/**
 * 只识别明确的绝对文件系统语法。先 decode 再判断，避免把 `%20` 保留成文件名；
 * drive path 必须先于 URI scheme 判断，否则 `C:` 会被误认为 scheme。
 */
export function parseLocalFileLink(href: string): LocalFileLinkTarget | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    return null;
  }

  const isWindowsDrivePath = /^[A-Za-z]:[\\/]/.test(decoded);
  const isUncPath = /^\\\\[^\\]+\\[^\\]+/.test(decoded);
  const isPosixAbsolutePath = decoded.startsWith("/");
  if (!isWindowsDrivePath && !isUncPath && !isPosixAbsolutePath) {
    return null;
  }

  return { requestedPath: decoded };
}
