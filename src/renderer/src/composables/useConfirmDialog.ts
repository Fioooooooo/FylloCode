import { useOverlay } from "@nuxt/ui/composables";
import type { ConfirmDialogColor } from "@renderer/components/shared/ConfirmDialog.vue";
import ConfirmDialog from "@renderer/components/shared/ConfirmDialog.vue";

export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmColor?: ConfirmDialogColor;
}

export function useConfirmDialog(): (options: ConfirmDialogOptions) => Promise<boolean> {
  const overlay = useOverlay();

  return async (options: ConfirmDialogOptions): Promise<boolean> => {
    const modal = overlay.create(ConfirmDialog, {
      destroyOnClose: true,
      props: options,
    });

    return modal.open();
  };
}
