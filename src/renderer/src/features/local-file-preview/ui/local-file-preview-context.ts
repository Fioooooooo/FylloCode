import type { InjectionKey } from "vue";

export interface LocalFilePreviewHost {
  open(requestedPath: string): Promise<void>;
}

export const localFilePreviewHostKey: InjectionKey<LocalFilePreviewHost> =
  Symbol("local-file-preview-host");
