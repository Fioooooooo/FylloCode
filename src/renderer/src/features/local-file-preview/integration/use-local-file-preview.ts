import { useOverlay } from "@nuxt/ui/composables";
import { markRaw } from "vue";
import { createLocalFilePreviewController } from "../application/local-file-preview-controller";
import LocalFilePreviewSlideover from "../ui/LocalFilePreviewSlideover.vue";
import { workspaceDocumentPreviewPort } from "./workspace-document-port";

interface ActivePreview {
  sequence: number;
  close: () => void;
  dispose: () => void;
}

let activePreview: ActivePreview | null = null;
let previewSequence = 0;

export function useLocalFilePreview(): {
  openLocalFilePreview: (requestedPath: string) => Promise<void>;
} {
  const overlay = useOverlay();

  async function openLocalFilePreview(requestedPath: string): Promise<void> {
    const sequence = ++previewSequence;
    activePreview?.dispose();
    activePreview?.close();

    // Nuxt UI stores overlay props in a deep reactive object, which would unwrap controller.state.
    const controller = markRaw(createLocalFilePreviewController(workspaceDocumentPreviewPort));
    const slideover = overlay.create(LocalFilePreviewSlideover, {
      destroyOnClose: true,
    });
    activePreview = {
      sequence,
      close: () => slideover.close(),
      dispose: () => controller.dispose(),
    };

    const instance = slideover.open({ controller });
    void controller.open(requestedPath);
    try {
      await instance.result;
    } finally {
      if (activePreview?.sequence === sequence) {
        controller.dispose();
        activePreview = null;
      }
    }
  }

  return { openLocalFilePreview };
}
