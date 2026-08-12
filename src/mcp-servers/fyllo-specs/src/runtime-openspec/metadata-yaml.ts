import { existsSync, readFileSync, writeFileSync } from "fs";
import { CORE_SCHEMA, dump, load } from "js-yaml";

export function readOpenSpecMetadata<T extends Record<string, unknown>>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }

  // js-yaml 4.x 默认会把 ISO 时间戳解析为 Date，5.x 则默认使用 CORE_SCHEMA 保留字符串；
  // 读取端显式对齐写入端，避免 4.x 产生 CORE_SCHEMA 无法再次序列化的 Date。
  return (load(readFileSync(path, "utf8"), { schema: CORE_SCHEMA }) as T | null) ?? null;
}

export function writeOpenSpecMetadata(path: string, value: Record<string, unknown>): void {
  writeFileSync(path, dump(value, { schema: CORE_SCHEMA }), "utf8");
}
