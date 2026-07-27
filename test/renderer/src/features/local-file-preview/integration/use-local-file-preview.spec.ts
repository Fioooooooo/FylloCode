import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRef, reactive } from "vue";
import { useLocalFilePreview } from "@renderer/features/local-file-preview/integration";

const mocks = vi.hoisted(() => {
  let resolveResult: (value?: unknown) => void = () => {};
  const result = new Promise<unknown>((resolve) => {
    resolveResult = resolve;
  });
  const overlayHandle = {
    open: vi.fn(() => ({ result })),
    close: vi.fn(),
  };
  return {
    create: vi.fn(() => overlayHandle),
    overlayHandle,
    resolveResult,
    preparePreview: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: "error",
        code: "FILE_NOT_FOUND",
        message: "missing",
      },
    }),
    confirmPreview: vi.fn(),
  };
});

vi.mock("@nuxt/ui/composables", () => ({
  useOverlay: () => ({ create: mocks.create }),
}));

vi.mock("@renderer/features/local-file-preview/integration/workspace-document-port", () => ({
  workspaceDocumentPreviewPort: {
    preparePreview: mocks.preparePreview,
    confirmPreview: mocks.confirmPreview,
  },
}));

describe("useLocalFilePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the global slideover only when open is invoked", async () => {
    const preview = useLocalFilePreview();

    expect(mocks.create).not.toHaveBeenCalled();
    const opening = preview.openLocalFilePreview("/project/file.ts");
    await Promise.resolve();

    expect(mocks.create).toHaveBeenCalledWith(expect.any(Object), {
      destroyOnClose: true,
    });
    expect(mocks.overlayHandle.open).toHaveBeenCalledWith({
      controller: expect.any(Object),
    });
    const openCalls = mocks.overlayHandle.open.mock.calls as unknown as Array<
      [{ controller: object }]
    >;
    const openProps = openCalls[0]![0];
    expect(isRef(Reflect.get(reactive(openProps).controller, "state"))).toBe(true);
    expect(mocks.preparePreview).toHaveBeenCalledWith({
      requestedPath: "/project/file.ts",
    });

    mocks.resolveResult();
    await opening;
  });
});
