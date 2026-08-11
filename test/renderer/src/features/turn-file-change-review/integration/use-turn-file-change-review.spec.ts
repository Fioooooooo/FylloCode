import { nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTurnFileChangeReview } from "@renderer/features/turn-file-change-review";
import type { TurnFileChange } from "@renderer/features/turn-file-change-review";

interface OverlayHandle {
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  resolve: () => void;
}

const overlayMocks = vi.hoisted(() => ({
  create: vi.fn(),
  handles: [] as OverlayHandle[],
}));

vi.mock("@nuxt/ui/composables", () => ({
  useOverlay: () => ({ create: overlayMocks.create }),
}));

function createOverlayHandle(): OverlayHandle {
  let resolve = () => {};
  const result = new Promise<void>((resolver) => {
    resolve = resolver;
  });
  const handle: OverlayHandle = {
    open: vi.fn(() => ({ result })),
    close: vi.fn(() => resolve()),
    resolve,
  };
  overlayMocks.handles.push(handle);
  return handle;
}

function change(path: string, modified = "after"): TurnFileChange {
  return { path, original: "before", modified, kind: "modified" };
}

function openedController(handle: OverlayHandle) {
  const calls = handle.open.mock.calls as unknown as Array<
    [
      {
        controller: {
          changes: { value: readonly TurnFileChange[] };
          selectedPath: { value: string | null };
        };
      },
    ]
  >;
  return calls[0]![0].controller;
}

describe("useTurnFileChangeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overlayMocks.handles.length = 0;
    overlayMocks.create.mockImplementation(() => createOverlayHandle());
  });

  it("creates a destroy-on-close Slideover with the requested initial path", async () => {
    const source = ref([change("/a.ts"), change("/b.ts")]);
    const review = useTurnFileChangeReview();
    const opening = review.openTurnFileChangeReview(source, "/b.ts");
    await nextTick();

    const handle = overlayMocks.handles[0]!;
    expect(overlayMocks.create).toHaveBeenCalledWith(expect.any(Object), {
      destroyOnClose: true,
    });
    expect(openedController(handle).selectedPath.value).toBe("/b.ts");

    handle.resolve();
    await opening;
  });

  it("syncs streaming changes while open and stops after the result settles", async () => {
    const source = ref([change("/a.ts")]);
    const opening = useTurnFileChangeReview().openTurnFileChangeReview(source);
    await nextTick();

    const handle = overlayMocks.handles[0]!;
    const controller = openedController(handle);
    source.value = [change("/b.ts", "latest")];
    await nextTick();
    expect(controller.changes.value).toEqual([change("/b.ts", "latest")]);
    expect(controller.selectedPath.value).toBe("/b.ts");

    handle.resolve();
    await opening;
    expect(controller.changes.value).toEqual([]);

    source.value = [change("/late.ts")];
    await nextTick();
    expect(controller.changes.value).toEqual([]);
  });

  it("replaces the active review and disposes its watcher and controller", async () => {
    const firstSource = ref([change("/first.ts")]);
    const firstOpening = useTurnFileChangeReview().openTurnFileChangeReview(firstSource);
    await nextTick();
    const firstHandle = overlayMocks.handles[0]!;
    const firstController = openedController(firstHandle);

    const secondSource = ref([change("/second.ts")]);
    const secondOpening = useTurnFileChangeReview().openTurnFileChangeReview(secondSource);
    await nextTick();
    const secondHandle = overlayMocks.handles[1]!;

    expect(firstHandle.close).toHaveBeenCalledOnce();
    expect(firstController.changes.value).toEqual([]);
    firstSource.value = [change("/late.ts")];
    await nextTick();
    expect(firstController.changes.value).toEqual([]);

    secondHandle.resolve();
    await Promise.all([firstOpening, secondOpening]);
  });
});
