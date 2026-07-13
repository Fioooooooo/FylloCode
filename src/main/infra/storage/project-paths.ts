import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";

// Windows reserved characters that are invalid in file names (excluding backslash, which is
// handled separately as a path separator).
const WINDOWS_INVALID_FILENAME_CHAR_PATTERN = /[<>:"|?*]/g;

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => (character.charCodeAt(0) < 32 ? "-" : character)).join(
    ""
  );
}

/**
 * Encode a project filesystem path into a directory-safe identifier.
 * Used as the directory name under `data/projects/<encoded>`.
 *
 * Transformation order matters:
 * 1. Strip leading `/` so absolute POSIX paths become relative.
 * 2. Strip Windows drive letter colons (`C:`) before replacing separators.
 * 3. Replace all `/` and `\` with `-` so nested paths flatten safely.
 * 4. Replace Windows-invalid filename characters.
 * 5. Replace control characters (code point < 32) to avoid invisible/dangerous names.
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

export function sessionPlansDir(projectPath: string, sessionId: string): string {
  return join(sessionsDir(projectPath), sessionId, "plans");
}

export function mcpEventsDir(projectPath: string): string {
  return join(projectDir(projectPath), "mcp-events");
}

export function knowledgeDir(projectPath: string): string {
  return join(projectDir(projectPath), "knowledge");
}

export function lineageDir(projectPath: string): string {
  return join(projectDir(projectPath), "lineage");
}

export function subjectsDir(projectPath: string): string {
  return join(lineageDir(projectPath), "subjects");
}

export function applyRunsDir(projectPath: string): string {
  return join(projectDir(projectPath), "apply-runs");
}

export function workflowsDir(projectPath: string): string {
  return join(projectDir(projectPath), "workflows");
}
