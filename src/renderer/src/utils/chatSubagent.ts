import {
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
  type UITools,
} from "ai";
import type { SubagentRunSummary, SubagentToolStats } from "@shared/types/stream-event";

export type ChatToolPart = DynamicToolUIPart | ToolUIPart<UITools>;

export interface ChatToolEntry {
  part: ChatToolPart;
  partIndex: number;
}

export interface SubagentDescendantEntry extends ChatToolEntry {
  depth: number;
}

export interface SubagentCallProjection {
  root: ChatToolEntry;
  descendants: SubagentDescendantEntry[];
}

export interface SubagentMessageProjection {
  roots: SubagentCallProjection[];
  rootByPartIndex: Map<number, SubagentCallProjection>;
  hiddenPartIndexes: Set<number>;
}

export type SubagentDisplayState = "running" | "completed" | "failed" | "interrupted";

export interface SubagentToolStatRow {
  key: keyof SubagentToolStats;
  label: string;
  value: number;
}

const TOOL_STAT_LABELS: Record<keyof SubagentToolStats, string> = {
  readCount: "读取",
  searchCount: "搜索",
  bashCount: "Bash",
  editFileCount: "编辑文件",
  linesAdded: "新增行",
  linesRemoved: "删除行",
  otherToolCount: "其他工具",
};

const TOOL_STAT_KEYS = Object.keys(TOOL_STAT_LABELS) as (keyof SubagentToolStats)[];

function metadataRecord(part: ChatToolPart): Record<string, unknown> | null {
  const metadata = part.toolMetadata;
  return metadata !== null && typeof metadata === "object"
    ? (metadata as Record<string, unknown>)
    : null;
}

function hasSubagentMarker(part: ChatToolPart): boolean {
  const metadata = metadataRecord(part);
  if (!metadata || !Object.prototype.hasOwnProperty.call(metadata, "subagent")) return false;
  return metadata.subagent !== null && typeof metadata.subagent === "object";
}

export function getSubagentSummary(part: ChatToolPart): SubagentRunSummary | undefined {
  if (!hasSubagentMarker(part)) return undefined;
  return metadataRecord(part)?.subagent as SubagentRunSummary;
}

export function getParentToolCallId(part: ChatToolPart): string | undefined {
  const parent = metadataRecord(part)?.parentToolCallId;
  return typeof parent === "string" && parent.length > 0 ? parent : undefined;
}

function collectToolEntries(parts: UIMessage["parts"]): ChatToolEntry[] {
  return parts.flatMap((part, partIndex) =>
    isToolUIPart(part) ? [{ part: part as ChatToolPart, partIndex }] : []
  );
}

function findCycleIndexes(parentByChild: Map<number, number>): Set<number> {
  const cycleIndexes = new Set<number>();

  for (const start of parentByChild.keys()) {
    const path: number[] = [];
    const seenAt = new Map<number, number>();
    let current: number | undefined = start;

    while (current !== undefined) {
      const previousIndex = seenAt.get(current);
      if (previousIndex !== undefined) {
        for (const index of path.slice(previousIndex)) cycleIndexes.add(index);
        break;
      }
      seenAt.set(current, path.length);
      path.push(current);
      current = parentByChild.get(current);
    }
  }

  return cycleIndexes;
}

function reachesCycle(
  start: number,
  parentByChild: Map<number, number>,
  cycleIndexes: Set<number>
): boolean {
  const visited = new Set<number>();
  let current: number | undefined = start;
  while (current !== undefined && !visited.has(current)) {
    if (cycleIndexes.has(current)) return true;
    visited.add(current);
    current = parentByChild.get(current);
  }
  return false;
}

export function projectSubagentCalls(parts: UIMessage["parts"]): SubagentMessageProjection {
  const entries = collectToolEntries(parts);
  const entriesById = new Map<string, ChatToolEntry[]>();
  const entryByPartIndex = new Map(entries.map((entry) => [entry.partIndex, entry]));

  for (const entry of entries) {
    const matches = entriesById.get(entry.part.toolCallId) ?? [];
    matches.push(entry);
    entriesById.set(entry.part.toolCallId, matches);
  }

  const uniqueById = new Map<string, ChatToolEntry>();
  for (const [toolCallId, matches] of entriesById) {
    if (matches.length === 1) uniqueById.set(toolCallId, matches[0]);
  }

  const tentativeParentByChild = new Map<number, number>();
  for (const child of entries) {
    if (!uniqueById.has(child.part.toolCallId)) continue;
    const parentId = getParentToolCallId(child.part);
    if (!parentId || parentId === child.part.toolCallId) continue;
    const parent = uniqueById.get(parentId);
    if (parent) tentativeParentByChild.set(child.partIndex, parent.partIndex);
  }

  const cycleIndexes = findCycleIndexes(tentativeParentByChild);
  const parentByChild = new Map<number, number>();
  for (const [childIndex, parentIndex] of tentativeParentByChild) {
    if (!reachesCycle(childIndex, tentativeParentByChild, cycleIndexes)) {
      parentByChild.set(childIndex, parentIndex);
    }
  }

  const parentIndexes = new Set(parentByChild.values());
  const nodeIndexes = new Set<number>();
  for (const entry of entries) {
    if (!uniqueById.has(entry.part.toolCallId) || cycleIndexes.has(entry.partIndex)) continue;
    if (hasSubagentMarker(entry.part) || parentIndexes.has(entry.partIndex)) {
      nodeIndexes.add(entry.partIndex);
    }
  }

  const rootEntries = entries.filter(
    (entry) => nodeIndexes.has(entry.partIndex) && !parentByChild.has(entry.partIndex)
  );
  const projectionsByRootIndex = new Map<number, SubagentCallProjection>();
  for (const root of rootEntries) {
    projectionsByRootIndex.set(root.partIndex, { root, descendants: [] });
  }

  const hiddenPartIndexes = new Set<number>();
  for (const entry of entries) {
    if (projectionsByRootIndex.has(entry.partIndex)) continue;

    let current = entry.partIndex;
    let depth = 0;
    const visited = new Set<number>();
    while (parentByChild.has(current) && !visited.has(current)) {
      visited.add(current);
      current = parentByChild.get(current)!;
      depth += 1;
    }

    const rootProjection = projectionsByRootIndex.get(current);
    if (!rootProjection || depth === 0 || !entryByPartIndex.has(current)) continue;
    rootProjection.descendants.push({ ...entry, depth });
    hiddenPartIndexes.add(entry.partIndex);
  }

  const roots = rootEntries.map((entry) => projectionsByRootIndex.get(entry.partIndex)!);
  return {
    roots,
    rootByPartIndex: new Map(roots.map((root) => [root.root.partIndex, root])),
    hiddenPartIndexes,
  };
}

export function resolveSubagentDisplayState(
  part: ChatToolPart,
  isCurrentStream: boolean
): SubagentDisplayState {
  const status = getSubagentSummary(part)?.status;
  if (status === "completed" || status === "failed") return status;
  if (status === undefined && part.state === "output-available") return "completed";
  return isCurrentStream ? "running" : "interrupted";
}

export function formatSubagentTokens(value: number | undefined): string {
  return value === undefined ? "—" : new Intl.NumberFormat("zh-CN").format(value);
}

export function formatSubagentDuration(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value < 1000) return `${Math.round(value)} 毫秒`;

  const seconds = value / 1000;
  if (seconds < 60) {
    return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(seconds)} 秒`;
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  if (minutes < 60) return `${minutes} 分 ${remainingSeconds.toString().padStart(2, "0")} 秒`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} 小时 ${remainingMinutes} 分`;
}

export function getSubagentToolStatRows(
  stats: SubagentToolStats | undefined
): SubagentToolStatRow[] {
  if (!stats) return [];
  return TOOL_STAT_KEYS.flatMap((key) => {
    const value = stats[key];
    return value === undefined ? [] : [{ key, label: TOOL_STAT_LABELS[key], value }];
  });
}
