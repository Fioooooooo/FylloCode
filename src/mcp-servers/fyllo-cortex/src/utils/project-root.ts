import { resolveSingleFolder } from "../../../shared/workspace-resolver";

export function resolveProjectRoot(): string {
  return resolveSingleFolder().folderPath;
}
