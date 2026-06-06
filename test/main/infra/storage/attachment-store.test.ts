import { existsSync, promises as fsPromises, readFileSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readAttachmentDataUrlInputSchema,
  saveAttachmentInputSchema,
} from "@shared/schemas/ipc/chat";

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

const projectPath = "/tmp/项目 with spaces";

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("attachment-store", () => {
  it("saves attachments with unicode and spaces in the original name", async () => {
    const saved = await saveAttachment(
      projectPath,
      "session-1",
      "截图 demo.png",
      "image/png",
      Buffer.from("image-data").toString("base64")
    );

    expect(saved.name).toBe("截图 demo.png");
    expect(saved.mimeType).toBe("image/png");
    expect(saved.absolutePath).toMatch(/\.png$/);
    expect(saved.fileUri).toMatch(/^file:\/\//);
    expect(readFileSync(saved.absolutePath, "utf8")).toBe("image-data");
  });

  it("uses the mime subtype as extension when the original file has no extension", async () => {
    const saved = await saveAttachment(
      projectPath,
      "session-1",
      "README",
      "text/markdown",
      Buffer.from("hello").toString("base64")
    );

    expect(saved.absolutePath).toMatch(/\.markdown$/);
  });

  it("reads a file:// image attachment into a data URL", async () => {
    const attachmentDir = join(tempRoot, "附件 目录");
    const filePath = join(attachmentDir, "截图 1.png");
    await fsPromises.mkdir(attachmentDir, { recursive: true });
    await fsPromises.writeFile(filePath, Buffer.from("image-data"));

    await expect(
      readAttachmentDataUrl(pathToFileURL(filePath).toString(), "image/png")
    ).resolves.toBe(`data:image/png;base64,${Buffer.from("image-data").toString("base64")}`);
  });

  it("rejects attachments larger than 25MB at the IPC schema boundary", () => {
    const payload = {
      projectId: "project-1",
      sessionId: "session-1",
      fileName: "large.bin",
      mimeType: "application/octet-stream",
      base64Data: Buffer.alloc(25 * 1024 * 1024 + 1).toString("base64"),
    };

    expect(saveAttachmentInputSchema.safeParse(payload).success).toBe(false);
  });

  it("validates readAttachmentDataUrl input without a size limit", () => {
    expect(
      readAttachmentDataUrlInputSchema.safeParse({
        uri: "file:///tmp/%E6%88%AA%E5%9B%BE%201.png",
        mediaType: "image/png",
      }).success
    ).toBe(true);
    expect(
      readAttachmentDataUrlInputSchema.safeParse({
        uri: "https://example.com/x.png",
        mediaType: "image/png",
      }).success
    ).toBe(false);
    expect(
      readAttachmentDataUrlInputSchema.safeParse({
        uri: "file:///tmp/doc.pdf",
        mediaType: "application/pdf",
      }).success
    ).toBe(false);
    expect(readAttachmentDataUrlInputSchema.safeParse({ uri: "file:///tmp/x.png" }).success).toBe(
      false
    );
  });

  it("removes session attachments and ignores missing directories", async () => {
    const saved = await saveAttachment(
      projectPath,
      "session-1",
      "notes.txt",
      "text/plain",
      Buffer.from("notes").toString("base64")
    );

    await removeSessionAttachments(projectPath, "session-1");
    expect(existsSync(saved.absolutePath)).toBe(false);
    await expect(removeSessionAttachments(projectPath, "missing")).resolves.toBeUndefined();
  });
});
