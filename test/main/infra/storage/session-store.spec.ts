import { mkdirSync, promises as fsPromises, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionMeta } from "@main/infra/storage/session-store";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-session-store-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import {
  createSessionMeta,
  listSessionMetas,
  loadSessionMeta,
  patchSessionMeta,
  saveSessionMeta,
} from "@main/infra/storage/session-store";
import { sessionsDir } from "@main/infra/storage/project-paths";

const projectPath = "/tmp/project";

function meta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: "session-1",
    agentId: "claude-acp",
    title: "Session",
    turnCount: 0,
    tokenUsage: { used: 0, size: 0 },
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

function sessionMetaPath(sessionId = "session-1"): string {
  return `${sessionsDir(projectPath)}/${sessionId}.json`;
}

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("session-store", () => {
  it("round-trips available commands with the snake_case storage key", async () => {
    await saveSessionMeta(
      projectPath,
      meta({
        available_commands: [{ name: "review", description: "Review code", hint: "path" }],
      })
    );

    const raw = JSON.parse(readFileSync(sessionMetaPath(), "utf8")) as Record<string, unknown>;
    expect(raw.available_commands).toEqual([
      { name: "review", description: "Review code", hint: "path" },
    ]);
    expect(raw.availableCommands).toBeUndefined();
    await expect(loadSessionMeta(projectPath, "session-1")).resolves.toEqual(
      meta({
        available_commands: [{ name: "review", description: "Review code", hint: "path" }],
      })
    );
  });

  it("preserves an explicit empty available commands array", async () => {
    await saveSessionMeta(projectPath, meta({ available_commands: [] }));

    await expect(loadSessionMeta(projectPath, "session-1")).resolves.toEqual(
      meta({ available_commands: [] })
    );
  });

  it("keeps missing or invalid available commands as undefined", async () => {
    await saveSessionMeta(projectPath, meta());
    await expect(loadSessionMeta(projectPath, "session-1")).resolves.toEqual(meta());

    mkdirSync(dirname(sessionMetaPath("session-2")), { recursive: true });
    writeFileSync(
      sessionMetaPath("session-2"),
      JSON.stringify({ ...meta({ sessionId: "session-2" }), available_commands: "invalid" }),
      "utf8"
    );

    await expect(loadSessionMeta(projectPath, "session-2")).resolves.toEqual(
      meta({ sessionId: "session-2" })
    );
  });

  it("patches token usage without dropping available commands", async () => {
    await createSessionMeta(
      projectPath,
      meta({
        available_commands: [{ name: "review", description: "Review code" }],
      })
    );

    await expect(
      patchSessionMeta(projectPath, "session-1", {
        tokenUsage: {
          used: 42,
          size: 1024,
          cost: { amount: 1.25, currency: "USD" },
        },
      })
    ).resolves.toEqual(
      meta({
        tokenUsage: {
          used: 42,
          size: 1024,
          cost: { amount: 1.25, currency: "USD" },
        },
        available_commands: [{ name: "review", description: "Review code" }],
      })
    );
  });

  it("preserves unknown fields when patching existing session meta", async () => {
    mkdirSync(dirname(sessionMetaPath()), { recursive: true });
    writeFileSync(
      sessionMetaPath(),
      JSON.stringify({
        ...meta(),
        available_commands: [{ name: "review", description: "Review code" }],
        future_field: { enabled: true },
      }),
      "utf8"
    );

    await patchSessionMeta(projectPath, "session-1", {
      title: "Updated Session",
    });

    const raw = JSON.parse(readFileSync(sessionMetaPath(), "utf8")) as Record<string, unknown>;
    expect(raw.title).toBe("Updated Session");
    expect(raw.available_commands).toEqual([{ name: "review", description: "Review code" }]);
    expect(raw.future_field).toEqual({ enabled: true });
  });

  it("reads malformed session meta files with trailing content without rewriting them", async () => {
    mkdirSync(dirname(sessionMetaPath()), { recursive: true });
    writeFileSync(
      sessionMetaPath(),
      `${JSON.stringify(
        meta({
          available_commands: [{ name: "review", description: "Review code" }],
        }),
        null,
        2
      )}\ntrailing-garbage`,
      "utf8"
    );

    await expect(listSessionMetas(projectPath)).resolves.toEqual([
      meta({
        available_commands: [{ name: "review", description: "Review code" }],
      }),
    ]);
    await expect(loadSessionMeta(projectPath, "session-1")).resolves.toEqual(
      meta({
        available_commands: [{ name: "review", description: "Review code" }],
      })
    );

    const unchangedContent = readFileSync(sessionMetaPath(), "utf8");
    expect(unchangedContent).toContain("trailing-garbage");
  });

  it("serializes concurrent writes to the same session meta file", async () => {
    const realWriteFile = fsPromises.writeFile.bind(fsPromises);
    let activeWrites = 0;
    let maxConcurrentWrites = 0;
    const targetPathPrefix = `${sessionMetaPath()}.`;
    const writeSpy = vi
      .spyOn(fsPromises, "writeFile")
      .mockImplementation(async (path, data, options) => {
        if (typeof path === "string" && path.startsWith(targetPathPrefix)) {
          activeWrites += 1;
          maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
          await new Promise((resolve) => setTimeout(resolve, 20));
          try {
            return await realWriteFile(path, data, options);
          } finally {
            activeWrites -= 1;
          }
        }

        return realWriteFile(path, data, options);
      });

    try {
      await Promise.all([
        saveSessionMeta(projectPath, meta({ title: "First Save" })),
        saveSessionMeta(projectPath, meta({ title: "Second Save" })),
      ]);
    } finally {
      writeSpy.mockRestore();
    }

    expect(maxConcurrentWrites).toBe(1);
    await expect(loadSessionMeta(projectPath, "session-1")).resolves.toMatchObject({
      sessionId: "session-1",
    });
  });

  it("upserts a missing session meta file without dropping future fields", async () => {
    await expect(
      import("@main/infra/storage/session-store").then(({ upsertSessionMeta }) =>
        upsertSessionMeta(
          projectPath,
          "session-3",
          () => ({
            ...meta({ sessionId: "session-3" }),
            available_commands: [{ name: "review", description: "Review code" }],
          }),
          {
            title: "Created Later",
          }
        )
      )
    ).resolves.toMatchObject({
      sessionId: "session-3",
      title: "Created Later",
      available_commands: [{ name: "review", description: "Review code" }],
    });
  });
});
