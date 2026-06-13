import logger from "@main/infra/logger";

/**
 * 逐行解析 JSONL 内容。单行解析失败时跳过该行并告警，
 * 不让一条损坏记录导致整份历史不可读（此前的实现用最外层
 * try/catch 包裹整个 map，单行损坏会使调用方拿到空数组）。
 *
 * @param content 原始文件内容（可能为空或含空行）
 * @param logTag  告警前缀，便于定位是哪个 store 的文件损坏
 */
export function parseJsonlLines<T>(content: string, logTag: string): T[] {
  const result: T[] = [];
  const lines = content.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    try {
      result.push(JSON.parse(line) as T);
    } catch {
      logger.warn(`[${logTag}] skipped malformed JSONL line (len=${line.length})`);
    }
  }
  return result;
}
