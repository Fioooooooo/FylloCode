import { ref, type Ref } from "vue";

export type FylloActionExecutionStatus = "ready" | "running" | "succeeded" | "failed" | "cancelled";

export interface FylloActionExecutionRuntime {
  status: Ref<FylloActionExecutionStatus>;
  executionError: Ref<string | null>;
  stateSyncError: Ref<string | null>;
  isRunning: Ref<boolean>;
  setRunning(): void;
  setSucceeded(): void;
  setFailed(error: string): void;
  setCancelled(): void;
  setStateSyncError(error: string): void;
  clearStateSyncError(): void;
  reset(): void;
}

export function createFylloActionExecutionRuntime(): FylloActionExecutionRuntime {
  const status = ref<FylloActionExecutionStatus>("ready");
  const executionError = ref<string | null>(null);
  const stateSyncError = ref<string | null>(null);
  const isRunning = ref(false);

  function setRunning(): void {
    status.value = "running";
    executionError.value = null;
    isRunning.value = true;
  }

  function setSucceeded(): void {
    status.value = "succeeded";
    executionError.value = null;
    isRunning.value = false;
  }

  function setFailed(error: string): void {
    status.value = "failed";
    executionError.value = error;
    isRunning.value = false;
  }

  function setCancelled(): void {
    status.value = "cancelled";
    executionError.value = null;
    isRunning.value = false;
  }

  function setStateSyncError(error: string): void {
    stateSyncError.value = error;
  }

  function clearStateSyncError(): void {
    stateSyncError.value = null;
  }

  function reset(): void {
    status.value = "ready";
    executionError.value = null;
    stateSyncError.value = null;
    isRunning.value = false;
  }

  return {
    status,
    executionError,
    stateSyncError,
    isRunning,
    setRunning,
    setSucceeded,
    setFailed,
    setCancelled,
    setStateSyncError,
    clearStateSyncError,
    reset,
  };
}
