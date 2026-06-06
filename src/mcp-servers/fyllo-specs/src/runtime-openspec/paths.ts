import { join } from "path";

export function changeDir(projectRoot: string, name: string): string {
  return join(projectRoot, "openspec", "changes", name);
}
