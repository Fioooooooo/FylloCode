import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";

const WINDOWS_INVALID_FILENAME_CHAR_PATTERN = /[<>:"|?*]/g;

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => (character.charCodeAt(0) < 32 ? "-" : character)).join(
    ""
  );
}

/**
 * Encode a project filesystem path into a directory-safe identifier.
 * Used as the directory name under `data/projects/<encoded>`.
 */
export function encodeProjectPath(projectPath: string): string {
  const encoded = projectPath
    .replace(/^\//, "")
    .replace(/^([A-Za-z]):(?=[\\/])/, "$1")
    .replace(/[\\/]/g, "-")
    .replace(WINDOWS_INVALID_FILENAME_CHAR_PATTERN, "-");
  return replaceControlCharacters(encoded);
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
