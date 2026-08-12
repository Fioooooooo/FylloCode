import { existsSync, readFileSync } from "fs";
import { load } from "js-yaml";

export function readYamlFile<T extends Record<string, unknown>>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }

  return (load(readFileSync(path, "utf8")) as T | null) ?? null;
}
