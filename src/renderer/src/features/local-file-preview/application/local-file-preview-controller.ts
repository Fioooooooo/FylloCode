import { shallowRef, type ShallowRef } from "vue";
import type { LocalFilePreviewState } from "../model/preview-state";
import type { WorkspaceDocumentPreviewPort } from "./ports";

export interface LocalFilePreviewController {
  state: ShallowRef<LocalFilePreviewState>;
  open(requestedPath: string): Promise<void>;
  confirm(input: { rememberForWindow: boolean }): Promise<void>;
  cancel(): void;
  dispose(): void;
}

function ipcErrorState(requestedPath: string, message: string): LocalFilePreviewState {
  return {
    status: "error",
    code: "READ_FAILED",
    message,
    requestedPath,
  };
}

export function createLocalFilePreviewController(
  port: WorkspaceDocumentPreviewPort
): LocalFilePreviewController {
  const state = shallowRef<LocalFilePreviewState>({ status: "idle" });
  let generation = 0;

  async function open(requestedPath: string): Promise<void> {
    const requestGeneration = ++generation;
    state.value = { status: "loading", requestedPath };
    try {
      const result = await port.preparePreview({ requestedPath });
      if (requestGeneration !== generation) return;
      state.value = result.ok ? result.data : ipcErrorState(requestedPath, result.error.message);
    } catch (error: unknown) {
      if (requestGeneration !== generation) return;
      state.value = ipcErrorState(
        requestedPath,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async function confirm(input: { rememberForWindow: boolean }): Promise<void> {
    const current = state.value;
    if (current.status !== "confirmation-required") return;

    const requestGeneration = ++generation;
    state.value = { status: "loading", requestedPath: current.requestedPath };
    try {
      const result = await port.confirmPreview({
        authorizationId: current.authorizationId,
        rememberForWindow: input.rememberForWindow,
      });
      if (requestGeneration !== generation) return;
      state.value = result.ok
        ? result.data
        : ipcErrorState(current.requestedPath, result.error.message);
    } catch (error: unknown) {
      if (requestGeneration !== generation) return;
      state.value = ipcErrorState(
        current.requestedPath,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  function cancel(): void {
    generation += 1;
    state.value = { status: "idle" };
  }

  function dispose(): void {
    cancel();
  }

  return { state, open, confirm, cancel, dispose };
}
