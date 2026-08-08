import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import type { MessageMeta } from "@shared/types/chat";
import { MAX_INLINE_RESPONSE_BYTES } from "@shared/types/fyllo-spawn-rpc";

const paths = vi.hoisted(() => ({ root: "" }));
vi.mock("@main/infra/paths", () => ({
  getDataSubPath: (subPath: string) => join(paths.root, subPath),
}));

import {
  appendSpawnedSessionMessage,
  claimSpawnNotification,
  createSpawnedTurnRecord,
  deleteSpawnedSessionParent,
  fenceSpawnedSessionParent,
  inlineSpawnedResponse,
  loadSpawnedSessionMessages,
  loadSpawnedSessionMeta,
  loadSpawnedTurnRecord,
  listPendingSpawnNotifications,
  listSpawnedTurnRecords,
  patchSpawnedTurnRecord,
  readSpawnedSessionResponseChunk,
  resetSpawnedSessionStoreForTests,
  spawnedMessageToResponseMarkdown,
  writeSpawnedSessionMeta,
  writeSpawnedSessionResponse,
  type SpawnedSessionMeta,
  type SpawnedTurnRecord,
} from "@main/infra/storage/spawned-session-store";
import {
  spawnedSessionTurnPath,
  spawnedSessionTurnsDir,
  spawnedSessionsDir,
} from "@main/infra/storage/workspace-paths";

const owner = { workspaceId: "workspace-1", parentSessionId: "parent-1", sessionId: "spawn-1" };

function meta(): SpawnedSessionMeta {
  const now = new Date().toISOString();
  return {
    version: 1,
    ...owner,
    agentId: "agent-1",
    workspaceSnapshot: {
      workspaceId: "workspace-1",
      workspaceKind: "folder",
      primaryFolderId: "folder-1",
      folders: [{ folderId: "folder-1", folderName: "Project", folderPath: "/work/project" }],
      cwd: "/work/project",
      additionalDirectories: [],
    },
    status: "idle",
    configOptions: [],
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

function message(role: "user" | "assistant", text: string): UIMessage<MessageMeta> {
  return {
    id: `${role}-${text}`,
    role,
    parts: [{ type: "text", text }],
    metadata: { sessionId: owner.sessionId, createdAt: new Date() },
  };
}

function turn(overrides: Partial<SpawnedTurnRecord> = {}): SpawnedTurnRecord {
  const now = new Date().toISOString();
  return {
    version: 1,
    ...owner,
    turnId: "turn-1",
    agentId: "agent-1",
    mode: "background",
    phase: "running",
    startedAt: now,
    lastActivityAt: now,
    recentActivity: [],
    config: [],
    warnings: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  paths.root = await mkdtemp(join(tmpdir(), "fyllocode-spawn-store-"));
  resetSpawnedSessionStoreForTests();
});

afterEach(async () => {
  resetSpawnedSessionStoreForTests();
  await rm(paths.root, { recursive: true, force: true });
});

describe("spawned-session-store", () => {
  it("atomically persists meta and preserves JSONL message ordering", async () => {
    await writeSpawnedSessionMeta(meta());
    await appendSpawnedSessionMessage(owner, message("user", "prompt"));
    await appendSpawnedSessionMessage(owner, message("assistant", "answer"));

    await expect(loadSpawnedSessionMeta(owner)).resolves.toMatchObject({
      sessionId: "spawn-1",
      agentId: "agent-1",
      status: "idle",
    });
    const messages = await loadSpawnedSessionMessages(owner);
    expect(messages.map((entry) => entry.role)).toEqual(["user", "assistant"]);
  });

  it("creates immutable response files", async () => {
    await writeSpawnedSessionResponse(owner, "response-1", "first");
    await expect(writeSpawnedSessionResponse(owner, "response-1", "second")).rejects.toMatchObject({
      code: "EEXIST",
    });

    expect(
      await readFile(
        join(spawnedSessionsDir("workspace-1", "parent-1"), "spawn-1/responses/response-1.md"),
        "utf8"
      )
    ).toBe("first");
  });

  it("creates and atomically patches strict sidecar turn records", async () => {
    await createSpawnedTurnRecord(turn());
    await expect(createSpawnedTurnRecord(turn())).rejects.toMatchObject({ code: "EEXIST" });

    const completedAt = new Date(Date.now() + 1_000).toISOString();
    await patchSpawnedTurnRecord(owner, "turn-1", {
      phase: "completed",
      responseId: "response-1",
      notification: {
        notificationId: "notification-1",
        state: "pending",
        updatedAt: completedAt,
      },
      updatedAt: completedAt,
    });

    await expect(loadSpawnedTurnRecord(owner, "turn-1")).resolves.toMatchObject({
      phase: "completed",
      responseId: "response-1",
      notification: { notificationId: "notification-1", state: "pending" },
    });
  });

  it("claims a pending notification at most once", async () => {
    const now = new Date().toISOString();
    await createSpawnedTurnRecord(
      turn({
        phase: "completed",
        responseId: "response-1",
        notification: {
          notificationId: "notification-1",
          state: "pending",
          updatedAt: now,
        },
      })
    );

    const [first, second] = await Promise.all([
      claimSpawnNotification("workspace-1", "notification-1", now),
      claimSpawnNotification("workspace-1", "notification-1", now),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    await expect(listPendingSpawnNotifications("workspace-1")).resolves.toEqual([]);
    await expect(loadSpawnedTurnRecord(owner, "turn-1")).resolves.toMatchObject({
      notification: { state: "dispatched" },
    });
  });

  it("isolates Workspace notification scans and unsafe turn identities", async () => {
    const now = new Date().toISOString();
    await createSpawnedTurnRecord(
      turn({
        phase: "completed",
        notification: {
          notificationId: "notification-1",
          state: "pending",
          updatedAt: now,
        },
      })
    );
    await expect(listPendingSpawnNotifications("workspace-2")).resolves.toEqual([]);
    await expect(createSpawnedTurnRecord(turn({ turnId: "../escape" }))).rejects.toThrow(
      "Turn ID is not safe for storage"
    );
  });

  it("keeps legacy meta readable and skips corrupt turn records during scans", async () => {
    await writeSpawnedSessionMeta(meta());
    await createSpawnedTurnRecord(turn());
    const turnsDir = spawnedSessionTurnsDir(
      owner.workspaceId,
      owner.parentSessionId,
      owner.sessionId
    );
    await mkdir(turnsDir, { recursive: true });
    await writeFile(
      spawnedSessionTurnPath(owner.workspaceId, owner.parentSessionId, owner.sessionId, "corrupt"),
      "{not-json",
      "utf8"
    );

    await expect(loadSpawnedSessionMeta(owner)).resolves.toMatchObject({ version: 1 });
    await expect(listSpawnedTurnRecords(owner)).resolves.toEqual([
      expect.objectContaining({ turnId: "turn-1" }),
    ]);
  });

  it("chunks UTF-8 without splitting multi-byte characters", async () => {
    const content = `${"a".repeat(MAX_INLINE_RESPONSE_BYTES - 1)}😀尾`;
    await writeSpawnedSessionResponse(owner, "response-utf8", content);

    const inline = inlineSpawnedResponse(content, "response-utf8");
    expect(inline.done).toBe(false);
    expect(inline.content).toBe("a".repeat(MAX_INLINE_RESPONSE_BYTES - 1));
    const tail = await readSpawnedSessionResponseChunk({
      owner,
      responseId: "response-utf8",
      cursor: inline.nextCursor,
      maxBytes: 4,
    });
    const final = await readSpawnedSessionResponseChunk({
      owner,
      responseId: "response-utf8",
      cursor: tail.nextCursor,
      maxBytes: 4,
    });

    expect(inline.content + tail.content + final.content).toBe(content);
    expect(final.done).toBe(true);
  });

  it("rejects invalid cursors and response mismatches", async () => {
    await writeSpawnedSessionResponse(owner, "response-1", "content");
    const first = await readSpawnedSessionResponseChunk({
      owner,
      responseId: "response-1",
      maxBytes: 4,
    });
    await expect(
      readSpawnedSessionResponseChunk({
        owner,
        responseId: "response-2",
        cursor: first.nextCursor,
      })
    ).rejects.toMatchObject({ code: "SPAWN_INVALID_REQUEST" });
    await expect(
      readSpawnedSessionResponseChunk({ owner, responseId: "response-1", cursor: "not+base64" })
    ).rejects.toMatchObject({ code: "SPAWN_INVALID_REQUEST" });
  });

  it("fences late writes and removes the parent's spawned subtree", async () => {
    await writeSpawnedSessionMeta(meta());
    fenceSpawnedSessionParent(owner.workspaceId, owner.parentSessionId);

    await expect(
      appendSpawnedSessionMessage(owner, message("assistant", "late"))
    ).rejects.toMatchObject({ code: "SPAWN_STORAGE_FENCED" });
    await expect(createSpawnedTurnRecord(turn())).rejects.toMatchObject({
      code: "SPAWN_STORAGE_FENCED",
    });
    await deleteSpawnedSessionParent(owner.workspaceId, owner.parentSessionId);
    await expect(loadSpawnedSessionMeta(owner)).resolves.toBeNull();
  });

  it("renders response Markdown without reasoning content", () => {
    const assistant = {
      ...message("assistant", "answer"),
      parts: [
        { type: "reasoning", text: "private" },
        { type: "text", text: "answer" },
        {
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "read",
          title: "Read files",
          state: "input-available",
          input: {},
        },
      ],
    } as UIMessage<MessageMeta>;

    expect(spawnedMessageToResponseMarkdown(assistant)).toBe("answer\n\n### Tool: Read files");
  });
});
