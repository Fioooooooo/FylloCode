import { describe, expect, it, vi } from "vitest";
import { createLocalFilePreviewController } from "@renderer/features/local-file-preview";
import type { WorkspaceDocumentPreviewPort } from "@renderer/features/local-file-preview";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("createLocalFilePreviewController", () => {
  it("moves from loading to confirmation and sends either remember choice", async () => {
    const confirmation = {
      status: "confirmation-required" as const,
      authorizationId: "auth-1",
      requestedPath: "/outside/file.ts",
      canonicalPath: "/outside/file.ts",
      size: 4,
      mtimeMs: 10,
    };
    const port: WorkspaceDocumentPreviewPort = {
      preparePreview: vi.fn().mockResolvedValue({ ok: true, data: confirmation }),
      confirmPreview: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          status: "ready",
          document: {
            requestedPath: "/outside/file.ts",
            canonicalPath: "/outside/file.ts",
            content: "test",
            language: "typescript",
            size: 4,
            mtimeMs: 10,
          },
        },
      }),
    };
    const controller = createLocalFilePreviewController(port);

    const opening = controller.open("/outside/file.ts");
    expect(controller.state.value).toEqual({
      status: "loading",
      requestedPath: "/outside/file.ts",
    });
    await opening;
    expect(controller.state.value).toEqual(confirmation);

    await controller.confirm({ rememberForWindow: true });

    expect(port.confirmPreview).toHaveBeenCalledWith({
      authorizationId: "auth-1",
      rememberForWindow: true,
    });
    expect(controller.state.value.status).toBe("ready");
  });

  it("ignores a stale response after a newer open", async () => {
    const first = deferred<Awaited<ReturnType<WorkspaceDocumentPreviewPort["preparePreview"]>>>();
    const port: WorkspaceDocumentPreviewPort = {
      preparePreview: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce({
          ok: true,
          data: {
            status: "error",
            code: "FILE_NOT_FOUND",
            message: "new result",
            requestedPath: "/new.ts",
          },
        }),
      confirmPreview: vi.fn(),
    };
    const controller = createLocalFilePreviewController(port);

    void controller.open("/old.ts");
    await controller.open("/new.ts");
    first.resolve({
      ok: true,
      data: {
        status: "error",
        code: "READ_FAILED",
        message: "old result",
        requestedPath: "/old.ts",
      },
    });
    await first.promise;

    expect(controller.state.value).toMatchObject({
      status: "error",
      message: "new result",
    });
  });

  it("cancels pending work and returns to idle", async () => {
    const result = deferred<Awaited<ReturnType<WorkspaceDocumentPreviewPort["preparePreview"]>>>();
    const controller = createLocalFilePreviewController({
      preparePreview: vi.fn().mockReturnValue(result.promise),
      confirmPreview: vi.fn(),
    });

    void controller.open("/file.ts");
    controller.cancel();
    result.resolve({
      ok: true,
      data: {
        status: "error",
        code: "FILE_NOT_FOUND",
        message: "late",
      },
    });
    await result.promise;

    expect(controller.state.value).toEqual({ status: "idle" });
  });
});
