import { existsSync, readFileSync, writeFileSync } from "fs";
import { dump, load } from "js-yaml";

export function readYamlFile<T extends Record<string, unknown>>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }

  return (load(readFileSync(path, "utf8")) as T | null) ?? null;
}

export function writeYamlFile(path: string, value: Record<string, unknown>): void {
  writeFileSync(path, `${dump(value)}`, "utf8");
}
