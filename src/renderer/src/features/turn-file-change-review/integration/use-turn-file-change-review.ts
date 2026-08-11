import { useOverlay } from "@nuxt/ui/composables";
import { markRaw, toValue, watch, type MaybeRefOrGetter, type WatchStopHandle } from "vue";
import { createTurnFileChangeReviewController } from "../application/turn-file-change-review-controller";
import type { TurnFileChange } from "../model/turn-file-changes";
import TurnFileChangeReviewSlideover from "../ui/TurnFileChangeReviewSlideover.vue";

interface ActiveReview {
  sequence: number;
  close: () => void;
  dispose: () => void;
}

let activeReview: ActiveReview | null = null;
let reviewSequence = 0;

function createLifecycle(
  stopChangesWatch: WatchStopHandle,
  disposeController: () => void
): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    stopChangesWatch();
    disposeController();
  };
}

export function useTurnFileChangeReview(): {
  openTurnFileChangeReview: (
    changes: MaybeRefOrGetter<readonly TurnFileChange[]>,
    initialPath?: string
  ) => Promise<void>;
} {
  const overlay = useOverlay();

  async function openTurnFileChangeReview(
    changes: MaybeRefOrGetter<readonly TurnFileChange[]>,
    initialPath?: string
  ): Promise<void> {
    const sequence = ++reviewSequence;
    activeReview?.dispose();
    activeReview?.close();

    // Overlay 会深度代理 props；markRaw 保留 controller 内 ShallowRef 的显式 .value 契约。
    const controller = markRaw(createTurnFileChangeReviewController(toValue(changes), initialPath));
    const stopChangesWatch = watch(
      () => toValue(changes),
      (nextChanges) => controller.setChanges(nextChanges),
      { deep: true }
    );
    const dispose = createLifecycle(stopChangesWatch, () => controller.dispose());
    const slideover = overlay.create(TurnFileChangeReviewSlideover, {
      destroyOnClose: true,
    });
    activeReview = {
      sequence,
      close: () => slideover.close(),
      dispose,
    };

    const instance = slideover.open({ controller });
    try {
      await instance.result;
    } finally {
      dispose();
      if (activeReview?.sequence === sequence) {
        activeReview = null;
      }
    }
  }

  return { openTurnFileChangeReview };
}
