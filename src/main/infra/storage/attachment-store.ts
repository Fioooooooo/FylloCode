import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { extname, join } from "path";
import { sessionsDir } from "@main/infra/storage/workspace-paths";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";

export interface SavedAttachment {
  attachmentId: string;
  name: string;
  mimeType: string;
}

const ATTACHMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const attachmentId = randomUUID();
  const absolutePath = join(dir, `${attachmentId}${inferExtension(fileName, mimeType)}`);
  await fs.writeFile(absolutePath, Buffer.from(base64Data, "base64"));

  return {
    attachmentId,
    name: fileName,
    mimeType,
  };
}

async function resolveAttachmentPath(
  workspaceId: string,
  sessionId: string,
  attachmentId: string
): Promise<string> {
  if (!ATTACHMENT_ID_PATTERN.test(attachmentId)) {
    throw ipcError(IpcErrorCodes.SESSION_ATTACHMENT_NOT_FOUND, "Attachment handle is invalid");
  }

  const dir = attachmentsDir(workspaceId, sessionId);
  const entries = await fs.readdir(dir).catch(() => []);
  const matches = entries.filter(
    (entry) => entry === attachmentId || entry.startsWith(`${attachmentId}.`)
  );
  if (matches.length !== 1) {
    throw ipcError(
      IpcErrorCodes.SESSION_ATTACHMENT_NOT_FOUND,
      "Attachment does not exist in this Workspace Session",
      { workspaceId, sessionId, attachmentId }
    );
  }
  return join(dir, matches[0]!);
}

export async function readAttachmentDataUrl(
  workspaceId: string,
  sessionId: string,
  attachmentId: string,
  mediaType: string
): Promise<string> {
  const buffer = await fs.readFile(
    await resolveAttachmentPath(workspaceId, sessionId, attachmentId)
  );
  return `data:${mediaType};base64,${buffer.toString("base64")}`;
}

export async function removeSessionAttachments(
  workspaceId: string,
  sessionId: string
): Promise<void> {
  await fs.rm(attachmentsDir(workspaceId, sessionId), { recursive: true, force: true });
}
