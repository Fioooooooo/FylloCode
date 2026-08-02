import { existsSync, rmSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAttachmentInputSchema } from "@shared/ipc/session/chat.schemas";
import { IpcErrorCodes } from "@shared/constants/error-codes";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-attachments-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import {
  readAttachmentDataUrl,
  removeSessionAttachments,
  saveAttachment,
} from "@main/infra/storage/attachment-store";

const workspaceId = "workspace-with-spaces";

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("attachment-store", () => {
  it("saves attachments with unicode and spaces in the original name", async () => {
    const saved = await saveAttachment(
      workspaceId,
      "session-1",
      "截图 demo.png",
      "image/png",
      Buffer.from("image-data").toString("base64")
    );

    expect(saved.name).toBe("截图 demo.png");
    expect(saved.mimeType).toBe("image/png");
    expect(saved.attachmentId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(saved).not.toHaveProperty("absolutePath");
    expect(saved).not.toHaveProperty("fileUri");
    await expect(
      readAttachmentDataUrl(workspaceId, "session-1", saved.attachmentId, "image/png")
    ).resolves.toBe(`data:image/png;base64,${Buffer.from("image-data").toString("base64")}`);
  });

  it("uses the mime subtype as extension when the original file has no extension", async () => {
    const saved = await saveAttachment(
      workspaceId,
      "session-1",
      "README",
      "text/markdown",
      Buffer.from("hello").toString("base64")
    );

    await expect(
      readAttachmentDataUrl(workspaceId, "session-1", saved.attachmentId, "text/markdown")
    ).resolves.toContain(Buffer.from("hello").toString("base64"));
  });

  it("rejects cross-Workspace, cross-Session and path-like handle access", async () => {
    const saved = await saveAttachment(
      workspaceId,
      "session-1",
      "image.png",
      "image/png",
      Buffer.from("image-data").toString("base64")
    );

    await expect(
      readAttachmentDataUrl("other-workspace", "session-1", saved.attachmentId, "image/png")
    ).rejects.toMatchObject({ code: IpcErrorCodes.SESSION_ATTACHMENT_NOT_FOUND });
    await expect(
      readAttachmentDataUrl(workspaceId, "other-session", saved.attachmentId, "image/png")
    ).rejects.toMatchObject({ code: IpcErrorCodes.SESSION_ATTACHMENT_NOT_FOUND });
    await expect(
      readAttachmentDataUrl(workspaceId, "session-1", "../../outside", "image/png")
    ).rejects.toMatchObject({ code: IpcErrorCodes.SESSION_ATTACHMENT_NOT_FOUND });
  });

  it("rejects attachments larger than 25MB at the IPC schema boundary", () => {
    const payload = {
      workspaceId: "workspace-1",
      sessionId: "session-1",
      fileName: "large.bin",
      mimeType: "application/octet-stream",
      base64Data: Buffer.alloc(25 * 1024 * 1024 + 1).toString("base64"),
    };

    expect(saveAttachmentInputSchema.safeParse(payload).success).toBe(false);
  });

  it("removes session attachments and ignores missing directories", async () => {
    const saved = await saveAttachment(
      workspaceId,
      "session-1",
      "notes.txt",
      "text/plain",
      Buffer.from("notes").toString("base64")
    );

    await removeSessionAttachments(workspaceId, "session-1");
    await expect(
      readAttachmentDataUrl(workspaceId, "session-1", saved.attachmentId, "text/plain")
    ).rejects.toMatchObject({ code: IpcErrorCodes.SESSION_ATTACHMENT_NOT_FOUND });
    expect(existsSync(`${tempRoot}/workspaces/${workspaceId}/sessions/session-1/attachments`)).toBe(
      false
    );
    await expect(removeSessionAttachments(workspaceId, "missing")).resolves.toBeUndefined();
  });
});
