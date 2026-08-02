import { ipcError } from "@main/ipc/_kit/errors";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";
import { escapeAngleBrackets } from "./shared";

const MAX_FOLDER_NAME_CODE_POINTS = 120;
const MAX_WORKSPACE_JSON_BYTES = 64 * 1024;

function truncateFolderName(folderName: string): string {
  const codePoints = Array.from(folderName);
  if (codePoints.length <= MAX_FOLDER_NAME_CODE_POINTS) {
    return folderName;
  }
  return `${codePoints.slice(0, MAX_FOLDER_NAME_CODE_POINTS - 1).join("")}…`;
}

export function renderWorkspaceSection(snapshot: SessionWorkspaceSnapshot): string {
  const projection = {
    workspaceId: snapshot.workspaceId,
    workspaceKind: snapshot.workspaceKind,
    primaryFolderId: snapshot.primaryFolderId,
    folders: snapshot.folders.map((folder) => ({
      folderId: folder.folderId,
      folderName: truncateFolderName(folder.folderName),
      folderPath: folder.folderPath,
    })),
  };
  const encodedJson = escapeAngleBrackets(JSON.stringify(projection));
  const encodedBytes = Buffer.byteLength(encodedJson, "utf8");
  if (encodedBytes > MAX_WORKSPACE_JSON_BYTES) {
    throw ipcError(
      IpcErrorCodes.WORKSPACE_REMINDER_TOO_LARGE,
      "Workspace reminder projection exceeds the 64 KiB limit",
      { workspaceId: snapshot.workspaceId, encodedBytes, maxBytes: MAX_WORKSPACE_JSON_BYTES }
    );
  }

  return ["<workspace>", encodedJson, "</workspace>"].join("\n");
}
