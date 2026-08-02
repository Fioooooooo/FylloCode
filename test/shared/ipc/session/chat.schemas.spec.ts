import { describe, expect, it } from "vitest";
import {
  createSessionInputSchema,
  persistMessageInputSchema,
  setConfigOptionInputSchema,
} from "@shared/ipc/session/chat.schemas";
import { chatPromptPartSchema } from "@shared/types/chat-prompt";

describe("createSessionInputSchema", () => {
  const base = {
    workspaceId: "w1",
    title: "Session",
    agentId: "claude-code",
  };

  it("accepts payload without fylloSessionId", () => {
    expect(createSessionInputSchema.parse(base)).toEqual(base);
  });

  it("accepts payload with fylloSessionId", () => {
    expect(
      createSessionInputSchema.parse({
        ...base,
        fylloSessionId: "session-probe",
      })
    ).toEqual({
      ...base,
      fylloSessionId: "session-probe",
    });
  });
});

describe("setConfigOptionInputSchema", () => {
  const baseSelect = {
    workspaceId: "w1",
    sessionId: "s1",
    configId: "model",
    type: "select" as const,
    value: "sonnet",
  };
  const baseBoolean = {
    workspaceId: "w1",
    sessionId: "s1",
    configId: "stream",
    type: "boolean" as const,
    value: true,
  };

  it("accepts valid select payload", () => {
    expect(setConfigOptionInputSchema.parse(baseSelect)).toEqual(baseSelect);
  });

  it("accepts valid boolean payload", () => {
    expect(setConfigOptionInputSchema.parse(baseBoolean)).toEqual(baseBoolean);
  });

  it("rejects boolean payload with string value", () => {
    const result = setConfigOptionInputSchema.safeParse({ ...baseBoolean, value: "true" });
    expect(result.success).toBe(false);
  });

  it("rejects select payload with boolean value", () => {
    const result = setConfigOptionInputSchema.safeParse({ ...baseSelect, value: true });
    expect(result.success).toBe(false);
  });

  it("rejects select payload with empty string value", () => {
    const result = setConfigOptionInputSchema.safeParse({ ...baseSelect, value: "" });
    expect(result.success).toBe(false);
  });

  it("rejects payload missing configId", () => {
    const { configId, ...rest } = baseSelect;
    void configId;
    const result = setConfigOptionInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects payload missing workspaceId", () => {
    const { workspaceId, ...rest } = baseSelect;
    void workspaceId;
    const result = setConfigOptionInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects payload missing sessionId", () => {
    const { sessionId, ...rest } = baseSelect;
    void sessionId;
    const result = setConfigOptionInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects payload with empty configId", () => {
    const result = setConfigOptionInputSchema.safeParse({ ...baseSelect, configId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects payload with unknown type", () => {
    const result = setConfigOptionInputSchema.safeParse({ ...baseSelect, type: "number" });
    expect(result.success).toBe(false);
  });
});

describe("scoped chat resource schemas", () => {
  const attachmentId = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts opaque attachments without a renderer path", () => {
    expect(
      chatPromptPartSchema.parse({
        type: "attachment",
        attachmentId,
        mediaType: "image/png",
        filename: "diagram.png",
      })
    ).toEqual({
      type: "attachment",
      attachmentId,
      mediaType: "image/png",
      filename: "diagram.png",
    });
  });

  it("rejects file URIs in the opaque attachment contract", () => {
    expect(
      chatPromptPartSchema.safeParse({
        type: "attachment",
        attachmentId,
        mediaType: "image/png",
        filename: "diagram.png",
        uri: "file:///tmp/diagram.png",
      }).success
    ).toBe(false);
  });

  it("accepts a scoped workspace file resource", () => {
    expect(
      chatPromptPartSchema.safeParse({
        type: "workspace_file",
        ref: {
          folderId: "folder-a",
          worktreePath: "/repos/a/.worktrees/change-a",
          repositoryRelativePath: "src/index.ts",
        },
        mediaType: "text/typescript",
        filename: "index.ts",
      }).success
    ).toBe(true);
  });

  it.each(["/etc/passwd", "../secret.txt", "src/../../secret.txt", "C:\\secret.txt"])(
    "rejects an escaping or absolute repository path: %s",
    (repositoryRelativePath) => {
      expect(
        chatPromptPartSchema.safeParse({
          type: "workspace_file",
          ref: {
            folderId: "folder-a",
            worktreePath: "/repos/a",
            repositoryRelativePath,
          },
          mediaType: "text/plain",
          filename: "secret.txt",
        }).success
      ).toBe(false);
    }
  );

  it("requires workspace file owner fields when persisting a user message", () => {
    const result = persistMessageInputSchema.safeParse({
      workspaceId: "workspace-a",
      sessionId: "session-a",
      message: {
        id: "message-a",
        role: "user",
        parts: [
          { type: "text", text: "Review this file" },
          {
            type: "workspace_file",
            ref: {
              worktreePath: "/repos/a",
              repositoryRelativePath: "src/index.ts",
            },
            mediaType: "text/typescript",
            filename: "index.ts",
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });
});
