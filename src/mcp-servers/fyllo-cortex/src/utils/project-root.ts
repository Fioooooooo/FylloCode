import { getProjectPath } from "../../../shared/env";

export function resolveProjectRoot(): string {
  return getProjectPath();
}
