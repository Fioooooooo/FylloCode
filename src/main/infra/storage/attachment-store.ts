import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { extname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { sessionsDir } from "@main/infra/storage/workspace-paths";

export interface SavedAttachment {
  absolutePath: string;
  fileUri: string;
  name: string;
  mimeType: string;
}

function attachmentsDir(workspaceId: string, sessionId: string): string {
  return join(sessionsDir(workspaceId), sessionId, "attachments");
}

function inferExtension(fileName: string, mimeType: string): string {
  const fileExtension = extname(fileName);
  if (fileExtension) {
    return fileExtension;
  }

  const subtype = mimeType.split("/").at(1)?.split(";").at(0)?.split("+").at(0);
  if (!subtype) {
    return "";
  }

  const safeSubtype = subtype.replace(/[^A-Za-z0-9_-]/g, "");
  return safeSubtype ? `.${safeSubtype}` : "";
}

export async function saveAttachment(
  workspaceId: string,
  sessionId: string,
  fileName: string,
  mimeType: string,
  base64Data: string
): Promise<SavedAttachment> {
  const dir = attachmentsDir(workspaceId, sessionId);
  await fs.mkdir(dir, { recursive: true });

  const absolutePath = join(dir, `${randomUUID()}${inferExtension(fileName, mimeType)}`);
  await fs.writeFile(absolutePath, Buffer.from(base64Data, "base64"));

  return {
    absolutePath,
    fileUri: pathToFileURL(absolutePath).toString(),
    name: fileName,
    mimeType,
  };
}

export async function readAttachmentDataUrl(uri: string, mediaType: string): Promise<string> {
  const buffer = await fs.readFile(fileURLToPath(uri));
  return `data:${mediaType};base64,${buffer.toString("base64")}`;
}

export async function removeSessionAttachments(
  workspaceId: string,
  sessionId: string
): Promise<void> {
  await fs.rm(attachmentsDir(workspaceId, sessionId), { recursive: true, force: true });
}
