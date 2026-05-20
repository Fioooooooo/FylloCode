import { rmSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchiveRunMeta } from "@shared/types/proposal";

const { tempRoot, loggerWarn } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@main/__tests__/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-archive-acp-session-store-"),
    loggerWarn: vi.fn(),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

vi.mock("@main/infra/logger", () => ({
  default: {
    warn: loggerWarn,
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { ArchiveAcpSessionStore } from "@main/infra/storage/archive-acp-session-store";
import { loadArchiveRunMeta, saveArchiveRunMeta } from "@main/infra/storage/apply-run-store";

const projectPath = "/tmp/project";

function archiveMeta(overrides: Partial<ArchiveRunMeta> = {}): ArchiveRunMeta {
  return {
    runId: "archive-1",
    changeId: "change-1",
    status: "running",
    startedAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  loggerWarn.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-18T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("archive-acp-session-store", () => {
  it("returns null when archive meta is missing", async () => {
    const store = new ArchiveAcpSessionStore(projectPath, "change-1");

    await expect(store.loadAcpSessionId()).resolves.toBeNull();
  });

  it("loads acpSessionId from archive meta", async () => {
    await saveArchiveRunMeta(projectPath, archiveMeta({ acpSessionId: "acp-existing" }));

    const store = new ArchiveAcpSessionStore(projectPath, "change-1");

    await expect(store.loadAcpSessionId()).resolves.toBe("acp-existing");
  });

  it("persists acpSessionId without dropping archive fields", async () => {
    await saveArchiveRunMeta(
      projectPath,
      archiveMeta({
        status: "done",
      })
    );

    const store = new ArchiveAcpSessionStore(projectPath, "change-1");

    await store.persistAcpSessionId("acp-new");

    await expect(loadArchiveRunMeta(projectPath, "change-1")).resolves.toEqual({
      runId: "archive-1",
      changeId: "change-1",
      status: "done",
      startedAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-18T10:00:00.000Z",
      acpSessionId: "acp-new",
    });
  });
});
