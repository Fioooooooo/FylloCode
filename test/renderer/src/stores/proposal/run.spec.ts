import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useProposalRunStore } from "@renderer/stores/proposal/run";
import { proposalApplyApi } from "@renderer/api/proposal/apply";
import { proposalArchiveApi } from "@renderer/api/proposal/archive";
import type { MessageChunkData } from "@shared/types/ipc";
import type { MessageMeta } from "@shared/types/chat";
import type { UIMessage } from "ai";

vi.mock("@renderer/api/proposal/apply", () => ({
  proposalApplyApi: {
    apply: vi.fn(),
    stageStream: vi.fn(),
    loadRun: vi.fn(),
    loadRunMessages: vi.fn(),
  },
}));

vi.mock("@renderer/api/proposal/archive", () => ({
  proposalArchiveApi: {
    archive: vi.fn(),
    loadArchive: vi.fn(),
    loadArchiveMessages: vi.fn(),
  },
}));

function userMessage(id: string): UIMessage<MessageMeta> {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: "prompt" }],
    metadata: { sessionId: "session-1", createdAt: new Date("2026-05-08T00:00:00.000Z") },
  };
}

describe("useProposalRunStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("inserts stage user_message before assistant chunks", async () => {
    let onChunk: ((chunk: MessageChunkData) => void) | null = null;
    vi.mocked(proposalApplyApi.apply).mockResolvedValue({
      ok: true,
      data: {
        runId: "run-1",
        stages: [{ id: "stage-1", name: "Apply", type: "proposal-apply" }],
      },
    });
    vi.mocked(proposalApplyApi.stageStream).mockImplementation((_input, callbacks) => {
      onChunk = callbacks.onChunk;
      return () => {};
    });

    const store = useProposalRunStore();
    await store.startRun("project-1", "change-1", "workflow-1");

    onChunk!({ kind: "user_message", message: userMessage("user-1") });
    onChunk!({ kind: "text_delta", text: "assistant" });

    expect(store.messages).toHaveLength(2);
    expect(store.messages[0]?.role).toBe("user");
    expect(store.messages[1]?.role).toBe("assistant");
  });

  it("inserts archive user_message while archiving", async () => {
    let onChunk: ((chunk: MessageChunkData) => void) | null = null;
    let onDone: ((data: { totalTokens: number }) => void) | null = null;
    vi.mocked(proposalArchiveApi.archive).mockImplementation((_input, callbacks) => {
      onChunk = callbacks.onChunk;
      onDone = callbacks.onDone;
      return () => {};
    });

    const store = useProposalRunStore();
    const promise = store.startArchive("project-1", "change-1");

    onChunk!({ kind: "user_message", message: userMessage("archive-user") });

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]?.id).toBe("archive-user");
    onDone!({ totalTokens: 1 });
    await expect(promise).resolves.toBeUndefined();
  });

  it("resumes archive meta and messages", async () => {
    vi.mocked(proposalArchiveApi.loadArchive).mockResolvedValue({
      ok: true,
      data: {
        runId: "archive-1",
        changeId: "change-1",
        status: "done",
        startedAt: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:01.000Z",
      },
    });
    vi.mocked(proposalArchiveApi.loadArchiveMessages).mockResolvedValue({
      ok: true,
      data: [userMessage("archive-user")],
    });

    const store = useProposalRunStore();
    await expect(store.resumeArchive("project-1", "change-1")).resolves.toBe(true);

    expect(store.archiveRunMeta?.runId).toBe("archive-1");
    expect(store.runMeta?.workflowId).toBe("archive");
    expect(store.messages).toHaveLength(1);
  });

  it("assembles reasoning_delta chunks during stage streaming", async () => {
    let onChunk: ((chunk: MessageChunkData) => void) | null = null;
    vi.mocked(proposalApplyApi.apply).mockResolvedValue({
      ok: true,
      data: {
        runId: "run-1",
        stages: [{ id: "stage-1", name: "Apply", type: "proposal-apply" }],
      },
    });
    vi.mocked(proposalApplyApi.stageStream).mockImplementation((_input, callbacks) => {
      onChunk = callbacks.onChunk;
      return () => {};
    });

    const store = useProposalRunStore();
    await store.startRun("project-1", "change-1", "workflow-1");

    onChunk!({ kind: "reasoning_delta", text: "think " });
    onChunk!({ kind: "reasoning_delta", text: "more" });

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]?.parts).toEqual([
      { type: "reasoning", text: "think more", state: "streaming" },
    ]);
  });

  it("ignores available_commands_update chunks during stage streaming", async () => {
    let onChunk: ((chunk: MessageChunkData) => void) | null = null;
    vi.mocked(proposalApplyApi.apply).mockResolvedValue({
      ok: true,
      data: {
        runId: "run-1",
        stages: [{ id: "stage-1", name: "Apply", type: "proposal-apply" }],
      },
    });
    vi.mocked(proposalApplyApi.stageStream).mockImplementation((_input, callbacks) => {
      onChunk = callbacks.onChunk;
      return () => {};
    });

    const store = useProposalRunStore();
    await store.startRun("project-1", "change-1", "workflow-1");

    onChunk!({
      kind: "available_commands_update",
      commands: [{ name: "review", description: "Review code" }],
    });

    expect(store.messages).toEqual([]);
  });
});
