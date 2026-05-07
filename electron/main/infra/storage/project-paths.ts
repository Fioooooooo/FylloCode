import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";

/**
 * Encode a project filesystem path into a directory-safe identifier.
 * Used as the directory name under `data/projects/<encoded>`.
 */
export function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/^\//, "").replace(/[\\/]/g, "-");
}

export function projectDir(projectPath: string): string {
  return join(getDataSubPath("projects"), encodeProjectPath(projectPath));
}

export function sessionsDir(projectPath: string): string {
  return join(projectDir(projectPath), "sessions");
}

export function applyRunsDir(projectPath: string): string {
  return join(projectDir(projectPath), "apply-runs");
}

export function workflowsDir(projectPath: string): string {
  return join(projectDir(projectPath), "workflows");
}
