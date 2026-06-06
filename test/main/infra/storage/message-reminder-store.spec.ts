import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { UIMessage, TextUIPart } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import { createTestTempRoot } from "@test/main/test-temp-root";
import { prependReminderToLastUserMessage } from "@main/infra/storage/message-reminder-store";

const tempRoot = createTestTempRoot("fyllocode-message-reminder-");

function userMessage(id: string, text: string): UIMessage<MessageMeta> {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
    metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
  };
}

function assistantMessage(id: string, text: string): UIMessage<MessageMeta> {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
    metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
  };
}

function readLines(filePath: string): UIMessage<MessageMeta>[] {
  return readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line: string) => {
      const message = JSON.parse(line) as Omit<UIMessage<MessageMeta>, "metadata"> & {
        metadata: {
          sessionId: string;
          createdAt: string;
        };
      };
      return {
        ...message,
        metadata: {
          ...message.metadata,
          createdAt: new Date(message.metadata.createdAt),
        },
      } as UIMessage<MessageMeta>;
    });
}

const reminder: TextUIPart = {
  type: "text",
  text: "<system-reminder>\nremember\n</system-reminder>",
};

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(tempRoot, { recursive: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("prependReminderToLastUserMessage", () => {
  it("throws when the file is empty", async () => {
    const filePath = `${tempRoot}/empty.messages.jsonl`;
    writeFileSync(filePath, "", "utf8");

    await expect(prependReminderToLastUserMessage(filePath, reminder)).rejects.toThrow(
      /No messages found/
    );
  });

  it("throws when there is no user message", async () => {
    const filePath = `${tempRoot}/assistant-only.messages.jsonl`;
    writeFileSync(filePath, `${JSON.stringify(assistantMessage("a1", "hello"))}\n`, "utf8");

    await expect(prependReminderToLastUserMessage(filePath, reminder)).rejects.toThrow(
      /No user message found/
    );
  });

  it("prepends the reminder to the last user message only", async () => {
    const filePath = `${tempRoot}/messages.jsonl`;
    writeFileSync(
      filePath,
      [
        JSON.stringify(userMessage("u1", "first")),
        JSON.stringify(assistantMessage("a1", "assistant")),
        JSON.stringify(userMessage("u2", "second")),
      ].join("\n") + "\n",
      "utf8"
    );

    await prependReminderToLastUserMessage(filePath, reminder);

    const lines = readLines(filePath);
    expect(lines[0]).toEqual(userMessage("u1", "first"));
    expect(lines[1]).toEqual(assistantMessage("a1", "assistant"));
    expect(lines[2].parts).toEqual([reminder, { type: "text", text: "second" }]);
  });

  it("keeps append compatibility and reminder order", async () => {
    const filePath = `${tempRoot}/append.messages.jsonl`;
    writeFileSync(filePath, `${JSON.stringify(userMessage("u1", "first"))}\n`, "utf8");

    await prependReminderToLastUserMessage(filePath, reminder);
    writeFileSync(
      filePath,
      readFileSync(filePath, "utf8") + `${JSON.stringify(assistantMessage("a1", "later"))}\n`,
      "utf8"
    );

    const lines = readLines(filePath);
    expect(lines[0].parts).toEqual([reminder, { type: "text", text: "first" }]);
    expect(lines[1]).toEqual(assistantMessage("a1", "later"));
  });
});
