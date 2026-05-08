import { rmSync } from "fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import type { ArchiveRunMeta } from "@shared/types/proposal";

const { tempRoot } = vi.hoisted(() => ({
  tempRoot: `/private/tmp/fyllocode-apply-run-${Math.random().toString(36).slice(2)}`,
}));

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import {
  appendArchiveMessage,
  loadArchiveMessages,
  loadArchiveRunMeta,
  saveArchiveRunMeta,
} from "@main/infra/storage/apply-run-store";

function message(id: string, text: string): UIMessage<MessageMeta> {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
    metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
  };
}

function persisted(message: UIMessage<MessageMeta>): UIMessage<MessageMeta> {
  return JSON.parse(JSON.stringify(message)) as UIMessage<MessageMeta>;
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("apply-run-store archive storage", () => {
  it("returns empty archive data when files do not exist", async () => {
    await expect(loadArchiveRunMeta("/tmp/project", "change-1")).resolves.toBeNull();
    await expect(loadArchiveMessages("/tmp/project", "change-1")).resolves.toEqual([]);
  });

  it("round-trips archive run meta", async () => {
    const meta: ArchiveRunMeta = {
      runId: "archive-1",
      changeId: "change-1",
      status: "running",
      startedAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    };

    await saveArchiveRunMeta("/tmp/project", meta);

    await expect(loadArchiveRunMeta("/tmp/project", "change-1")).resolves.toEqual(meta);
  });

  it("appends archive messages in order", async () => {
    const first = message("message-1", "first");
    const second = message("message-2", "second");

    await appendArchiveMessage("/tmp/project", "change-1", first);
    await appendArchiveMessage("/tmp/project", "change-1", second);

    await expect(loadArchiveMessages("/tmp/project", "change-1")).resolves.toEqual([
      persisted(first),
      persisted(second),
    ]);
  });
});
