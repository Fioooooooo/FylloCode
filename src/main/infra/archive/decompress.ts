import decompress from "@xhmikosr/decompress";

/**
 * 统一的归档解压边界。第三方库返回的条目只在此处可见，调用方只依赖写盘完成的 Promise。
 */
export async function decompressArchive(
  archivePath: string,
  outputDirectory: string
): Promise<void> {
  let entries: Array<{ data: Buffer }> | undefined;

  try {
    entries = await decompress(archivePath, outputDirectory);
    if (entries.length === 0) {
      throw new Error("归档格式无法识别或归档内容为空");
    }
  } finally {
    if (entries) {
      for (const entry of entries) {
        entry.data = Buffer.alloc(0);
      }
      entries.length = 0;
      entries = undefined;
    }
  }
}
