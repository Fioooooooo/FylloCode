import { existsSync, readFileSync, writeFileSync } from "fs";
import { CORE_SCHEMA, dump, load } from "js-yaml";

export function readOpenSpecMetadata<T extends Record<string, unknown>>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }

  return (load(readFileSync(path, "utf8")) as T | null) ?? null;
}

export function writeOpenSpecMetadata(path: string, value: Record<string, unknown>): void {
  writeFileSync(path, dump(value, { schema: CORE_SCHEMA }), "utf8");
}
