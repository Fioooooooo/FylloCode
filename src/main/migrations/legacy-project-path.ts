import { join } from "path";
import { getDataSubPath } from "@main/infra/paths";

// Frozen locator for legacy Project app-data. New runtime code must use Workspace/Folder IDs.
const WINDOWS_INVALID_FILENAME_CHAR_PATTERN = /[<>:"|?*]/g;

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => (character.charCodeAt(0) < 32 ? "-" : character)).join(
    ""
  );
}

export function encodeProjectPath(projectPath: string): string {
  const encoded = projectPath
    .replace(/^\//, "")
    .replace(/^([A-Za-z]):(?=[\\/])/, "$1")
    .replace(/[\\/]/g, "-")
    .replace(WINDOWS_INVALID_FILENAME_CHAR_PATTERN, "-");
  return replaceControlCharacters(encoded);
}

export function legacyProjectDataPath(legacyAppDataKey: string): string {
  if (
    !legacyAppDataKey ||
    legacyAppDataKey === "." ||
    legacyAppDataKey === ".." ||
    /[\\/\0]/.test(legacyAppDataKey)
  ) {
    throw new Error("Legacy Project app-data key is not safe for storage");
  }
  return join(getDataSubPath("projects"), legacyAppDataKey);
}
