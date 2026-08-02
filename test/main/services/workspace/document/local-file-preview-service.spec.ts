import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalTextFileError } from "@main/infra/files/local-text-file";
import {
  LocalFilePreviewService,
  type LocalFilePreviewSender,
  type LocalFilePreviewServiceDependencies,
} from "@main/services/workspace/document/local-file-preview-service";

class FakeSender extends EventEmitter implements LocalFilePreviewSender {
  constructor(readonly id: number) {
    super();
  }
}

const canonicalProject = "/canonical/project";
const externalPath = "/outside/file.ts";
const baseTarget = {
  requestedPath: externalPath,
  canonicalPath: externalPath,
  size: 4,
  mtimeMs: 10,
};
const baseSnapshot = {
  canonicalPath: externalPath,
  content: "test",
  size: 4,
  mtimeMs: 10,
};

function createHarness(overrides: Partial<LocalFilePreviewServiceDependencies> = {}) {
  let now = 1_000;
  const dependencies: LocalFilePreviewServiceDependencies = {
    canonicalizePath: vi.fn(async (path: string) =>
      path === "/project" ? canonicalProject : path
    ),
    resolveTarget: vi.fn().mockResolvedValue(baseTarget),
    inspectFile: vi.fn().mockResolvedValue({
      canonicalPath: externalPath,
      size: 4,
      mtimeMs: 10,
    }),
    readFile: vi.fn().mockResolvedValue(baseSnapshot),
    listWorktrees: vi.fn().mockResolvedValue({ paths: [] }),
    createAuthorizationId: vi
      .fn()
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002"),
    now: vi.fn(() => now),
    ...overrides,
  };
  const service = new LocalFilePreviewService(dependencies);
  const sender = new FakeSender(7);
  const context = { workspaceId: "workspace-1", folderPath: "/project", sender };
  return {
    service,
    dependencies,
    sender,
    context,
    advance(ms: number) {
      now += ms;
    },
  };
}

async function requestAuthorization(harness: ReturnType<typeof createHarness>) {
  const result = await harness.service.preparePreview(
    { requestedPath: externalPath },
    harness.context
  );
  expect(result.status).toBe("confirmation-required");
  if (result.status !== "confirmation-required") throw new Error("authorization expected");
  return result.authorizationId;
}

describe("LocalFilePreviewService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["md", "MARKDOWN", "mdown", "MkDn", "mkd", "MDWN", "mdtxt", "MdText"])(
    "recognizes .%s as Markdown",
    async (extension) => {
      const canonicalPath = `/canonical/project/docs/guide.${extension}`;
      const harness = createHarness({
        resolveTarget: vi.fn().mockResolvedValue({ ...baseTarget, canonicalPath }),
        readFile: vi.fn().mockResolvedValue({ ...baseSnapshot, canonicalPath }),
      });

      await expect(
        harness.service.preparePreview({ requestedPath: canonicalPath }, harness.context)
      ).resolves.toMatchObject({
        status: "ready",
        document: { language: "markdown" },
      });
    }
  );

  it("keeps unknown extensions on the existing plaintext fallback", async () => {
    const canonicalPath = "/canonical/project/docs/guide.notes";
    const harness = createHarness({
      resolveTarget: vi.fn().mockResolvedValue({ ...baseTarget, canonicalPath }),
      readFile: vi.fn().mockResolvedValue({ ...baseSnapshot, canonicalPath }),
    });

    await expect(
      harness.service.preparePreview({ requestedPath: canonicalPath }, harness.context)
    ).resolves.toMatchObject({
      status: "ready",
      document: { language: "plaintext" },
    });
  });

  it("opens project and registered worktree files without confirmation", async () => {
    const projectHarness = createHarness({
      resolveTarget: vi.fn().mockResolvedValue({
        ...baseTarget,
        canonicalPath: "/canonical/project/src/app.ts",
      }),
      readFile: vi.fn().mockResolvedValue({
        ...baseSnapshot,
        canonicalPath: "/canonical/project/src/app.ts",
      }),
    });
    const worktreeHarness = createHarness({
      resolveTarget: vi.fn().mockResolvedValue({
        ...baseTarget,
        canonicalPath: "/linked/worktree/src/app.ts",
      }),
      listWorktrees: vi.fn().mockResolvedValue({ paths: ["/linked/worktree"] }),
      readFile: vi.fn().mockResolvedValue({
        ...baseSnapshot,
        canonicalPath: "/linked/worktree/src/app.ts",
      }),
    });

    await expect(
      projectHarness.service.preparePreview({ requestedPath: externalPath }, projectHarness.context)
    ).resolves.toMatchObject({ status: "ready" });
    await expect(
      worktreeHarness.service.preparePreview(
        { requestedPath: externalPath },
        worktreeHarness.context
      )
    ).resolves.toMatchObject({ status: "ready" });
  });

  it("treats a canonical symlink escape as external and returns no content", async () => {
    const harness = createHarness();

    const result = await harness.service.preparePreview(
      { requestedPath: "/project/link.ts" },
      harness.context
    );

    expect(result).toEqual({
      status: "confirmation-required",
      authorizationId: "00000000-0000-4000-8000-000000000001",
      requestedPath: "/project/link.ts",
      canonicalPath: externalPath,
      size: 4,
      mtimeMs: 10,
      line: undefined,
      column: undefined,
    });
    expect(result).not.toHaveProperty("content");
    expect(harness.dependencies.readFile).not.toHaveBeenCalled();
  });

  it("allows one-time opening without remembering the path", async () => {
    const harness = createHarness();
    const authorizationId = await requestAuthorization(harness);

    await expect(
      harness.service.confirmPreview({ authorizationId, rememberForWindow: false }, harness.context)
    ).resolves.toMatchObject({ status: "ready" });
    await expect(
      harness.service.preparePreview({ requestedPath: externalPath }, harness.context)
    ).resolves.toMatchObject({
      status: "confirmation-required",
      authorizationId: "00000000-0000-4000-8000-000000000002",
    });
  });

  it("remembers a successfully read path for the same window and Workspace", async () => {
    const harness = createHarness();
    const authorizationId = await requestAuthorization(harness);

    await harness.service.confirmPreview(
      { authorizationId, rememberForWindow: true },
      harness.context
    );
    const reopened = await harness.service.preparePreview(
      { requestedPath: externalPath },
      harness.context
    );

    expect(reopened.status).toBe("ready");
    expect(harness.dependencies.readFile).toHaveBeenCalledTimes(2);
  });

  it("does not reuse grants for another Workspace or changed canonical target", async () => {
    const harness = createHarness();
    const authorizationId = await requestAuthorization(harness);
    await harness.service.confirmPreview(
      { authorizationId, rememberForWindow: true },
      harness.context
    );

    const otherWorkspace = await harness.service.preparePreview(
      { requestedPath: externalPath },
      { ...harness.context, workspaceId: "workspace-2" }
    );
    vi.mocked(harness.dependencies.resolveTarget).mockResolvedValueOnce({
      ...baseTarget,
      canonicalPath: "/outside/other.ts",
    });
    const changedTarget = await harness.service.preparePreview(
      { requestedPath: externalPath },
      harness.context
    );

    expect(otherWorkspace.status).toBe("confirmation-required");
    expect(changedTarget.status).toBe("confirmation-required");
  });

  it("rejects authorization from another sender and consumes the token", async () => {
    const harness = createHarness();
    const authorizationId = await requestAuthorization(harness);
    const otherContext = { ...harness.context, sender: new FakeSender(9) };

    await expect(
      harness.service.confirmPreview({ authorizationId, rememberForWindow: true }, otherContext)
    ).resolves.toMatchObject({ status: "error", code: "AUTHORIZATION_INVALID" });
    await expect(
      harness.service.confirmPreview({ authorizationId, rememberForWindow: true }, harness.context)
    ).resolves.toMatchObject({ status: "error", code: "AUTHORIZATION_INVALID" });
  });

  it("rejects authorization after the sender switches Workspace", async () => {
    const harness = createHarness();
    const authorizationId = await requestAuthorization(harness);

    await expect(
      harness.service.confirmPreview(
        { authorizationId, rememberForWindow: true },
        { ...harness.context, workspaceId: "workspace-2" }
      )
    ).resolves.toMatchObject({ status: "error", code: "AUTHORIZATION_INVALID" });
    expect(harness.dependencies.readFile).not.toHaveBeenCalled();
  });

  it("falls back to the canonical Folder root when worktree discovery fails", async () => {
    const harness = createHarness({
      listWorktrees: vi.fn().mockRejectedValue(new Error("git unavailable")),
      resolveTarget: vi.fn().mockResolvedValue({
        ...baseTarget,
        canonicalPath: "/canonical/project/src/app.ts",
      }),
      readFile: vi.fn().mockResolvedValue({
        ...baseSnapshot,
        canonicalPath: "/canonical/project/src/app.ts",
      }),
    });

    await expect(
      harness.service.preparePreview({ requestedPath: externalPath }, harness.context)
    ).resolves.toMatchObject({ status: "ready" });

    const externalHarness = createHarness({
      listWorktrees: vi.fn().mockRejectedValue(new Error("git unavailable")),
    });
    await expect(
      externalHarness.service.preparePreview(
        { requestedPath: externalPath },
        externalHarness.context
      )
    ).resolves.toMatchObject({ status: "confirmation-required" });
  });

  it("rejects expired and changed authorizations", async () => {
    const expired = createHarness();
    const expiredId = await requestAuthorization(expired);
    expired.advance(60_001);
    await expect(
      expired.service.confirmPreview(
        { authorizationId: expiredId, rememberForWindow: false },
        expired.context
      )
    ).resolves.toMatchObject({ status: "error", code: "AUTHORIZATION_INVALID" });

    const changed = createHarness({
      inspectFile: vi.fn().mockResolvedValue({
        canonicalPath: externalPath,
        size: 5,
        mtimeMs: 11,
      }),
    });
    const changedId = await requestAuthorization(changed);
    await expect(
      changed.service.confirmPreview(
        { authorizationId: changedId, rememberForWindow: false },
        changed.context
      )
    ).resolves.toMatchObject({ status: "error", code: "FILE_CHANGED" });
  });

  it("does not remember a path when reading fails", async () => {
    const harness = createHarness({
      readFile: vi
        .fn()
        .mockRejectedValueOnce(new LocalTextFileError("INVALID_UTF8", "invalid"))
        .mockResolvedValue(baseSnapshot),
    });
    const authorizationId = await requestAuthorization(harness);

    await expect(
      harness.service.confirmPreview({ authorizationId, rememberForWindow: true }, harness.context)
    ).resolves.toMatchObject({ status: "error", code: "INVALID_UTF8" });
    await expect(
      harness.service.preparePreview({ requestedPath: externalPath }, harness.context)
    ).resolves.toMatchObject({ status: "confirmation-required" });
  });

  it("clears grants and pending authorizations when sender is destroyed", async () => {
    const harness = createHarness();
    const authorizationId = await requestAuthorization(harness);
    await harness.service.confirmPreview(
      { authorizationId, rememberForWindow: true },
      harness.context
    );

    harness.sender.emit("destroyed");

    await expect(
      harness.service.preparePreview({ requestedPath: externalPath }, harness.context)
    ).resolves.toMatchObject({ status: "confirmation-required" });
  });

  it("revalidates remembered files instead of bypassing read checks", async () => {
    const harness = createHarness({
      readFile: vi
        .fn()
        .mockResolvedValueOnce(baseSnapshot)
        .mockRejectedValueOnce(new LocalTextFileError("FILE_TOO_LARGE", "too large")),
    });
    const authorizationId = await requestAuthorization(harness);
    await harness.service.confirmPreview(
      { authorizationId, rememberForWindow: true },
      harness.context
    );

    await expect(
      harness.service.preparePreview({ requestedPath: externalPath }, harness.context)
    ).resolves.toMatchObject({ status: "error", code: "FILE_TOO_LARGE" });
  });
});
