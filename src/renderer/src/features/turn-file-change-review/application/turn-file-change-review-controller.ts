import { computed, shallowRef, type ComputedRef, type ShallowRef } from "vue";
import type { TurnFileChange } from "../model/turn-file-changes";

export interface TurnFileChangeReviewController {
  changes: ShallowRef<readonly TurnFileChange[]>;
  selectedPath: ShallowRef<string | null>;
  selectedChange: ComputedRef<TurnFileChange | null>;
  select(path: string): void;
  setChanges(changes: readonly TurnFileChange[]): void;
  dispose(): void;
}

export function createTurnFileChangeReviewController(
  initialChanges: readonly TurnFileChange[],
  initialPath?: string
): TurnFileChangeReviewController {
  const changes = shallowRef<readonly TurnFileChange[]>([]);
  const selectedPath = shallowRef<string | null>(initialPath ?? null);
  const selectedChange = computed(
    () => changes.value.find((change) => change.path === selectedPath.value) ?? null
  );

  function setChanges(nextChanges: readonly TurnFileChange[]): void {
    changes.value = [...nextChanges];
    const currentPath = selectedPath.value;
    if (currentPath && nextChanges.some((change) => change.path === currentPath)) return;
    selectedPath.value = nextChanges[0]?.path ?? null;
  }

  function select(path: string): void {
    if (changes.value.some((change) => change.path === path)) {
      selectedPath.value = path;
    }
  }

  function dispose(): void {
    changes.value = [];
    selectedPath.value = null;
  }

  setChanges(initialChanges);

  return { changes, selectedPath, selectedChange, select, setChanges, dispose };
}
