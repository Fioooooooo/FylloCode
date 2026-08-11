import type { ToolCallDiff } from "@shared/types/stream-event";

export type TurnFileChangeKind = "added" | "modified" | "deleted";

export interface TurnFileChange {
  path: string;
  original: string;
  modified: string;
  kind: TurnFileChangeKind;
}

function classifyChange(original: string, modified: string): TurnFileChangeKind {
  if (original.length === 0) return "added";
  if (modified.length === 0) return "deleted";
  return "modified";
}

/**
 * 将按事件顺序排列的工具 diff 聚合为本轮净变化；同一路径的中间版本不会泄漏到结果中。
 */
export function projectTurnFileChanges(
  toolDiffs: readonly (readonly ToolCallDiff[])[]
): TurnFileChange[] {
  const changesByPath = new Map<string, { original: string; modified: string }>();

  for (const diffs of toolDiffs) {
    for (const diff of diffs) {
      const current = changesByPath.get(diff.path);
      if (current) {
        current.modified = diff.newText;
        continue;
      }

      changesByPath.set(diff.path, {
        original: diff.oldText ?? "",
        modified: diff.newText,
      });
    }
  }

  return Array.from(changesByPath, ([path, change]) => ({ path, ...change }))
    .filter((change) => change.original !== change.modified)
    .map((change) => ({
      ...change,
      kind: classifyChange(change.original, change.modified),
    }));
}

/**
 * 返回当前工具仍属于本轮净变化的去重入口，同时保持该工具自身的首次路径顺序。
 */
export function selectToolTurnFileChanges(
  diffs: readonly ToolCallDiff[],
  turnChanges: readonly TurnFileChange[]
): TurnFileChange[] {
  const changesByPath = new Map(turnChanges.map((change) => [change.path, change]));
  const selectedPaths = new Set<string>();
  const selected: TurnFileChange[] = [];

  for (const diff of diffs) {
    if (selectedPaths.has(diff.path)) continue;
    selectedPaths.add(diff.path);

    const change = changesByPath.get(diff.path);
    if (change) selected.push(change);
  }

  return selected;
}
