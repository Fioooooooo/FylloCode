import { isReasoningUIPart, isToolUIPart, type UIMessage } from "ai";
import {
  getToolIcon,
  getToolKind,
  type ChatToolPart,
  type ToolKind,
} from "@renderer/utils/chatTool";
import type {
  SubagentCallProjection,
  SubagentMessageProjection,
} from "@renderer/utils/chatSubagent";

type MessagePart = UIMessage["parts"][number];
type ChatReasoningPart = Extract<MessagePart, { type: "reasoning" }>;

export interface AssistantActivityEntry {
  part: ChatReasoningPart | ChatToolPart;
  partIndex: number;
}

export type AssistantRenderItem =
  | { kind: "part"; key: string; part: MessagePart; partIndex: number }
  | { kind: "activity-group"; key: string; activities: AssistantActivityEntry[] }
  | { kind: "subagent-call"; key: string; call: SubagentCallProjection };

type ActivityKind = "think" | ToolKind;

const ACTIVITY_KIND_LABELS: Record<ActivityKind, { verb: string; noun: string }> = {
  think: { verb: "Think", noun: "time" },
  read: { verb: "Read", noun: "file" },
  write: { verb: "Write", noun: "file" },
  edit: { verb: "Edit", noun: "file" },
  search: { verb: "Search", noun: "tool" },
  execute: { verb: "Run", noun: "command" },
  other: { verb: "Run", noun: "tool" },
};

function buildPartKey(messageId: string, part: MessagePart, partIndex: number): string {
  return `${messageId}-${part.type}-${partIndex}`;
}

function getActivityKind(entry: AssistantActivityEntry): ActivityKind {
  return isReasoningUIPart(entry.part) ? "think" : getToolKind(entry.part);
}

function getActivityIcon(entry: AssistantActivityEntry): string {
  return isReasoningUIPart(entry.part) ? "i-lucide-brain" : getToolIcon(entry.part);
}

export function summarizeActivityGroup(entries: AssistantActivityEntry[]): string {
  const counts = new Map<ActivityKind, number>();

  for (const entry of entries) {
    const kind = getActivityKind(entry);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([kind, count]) => {
      const label = ACTIVITY_KIND_LABELS[kind];
      const noun = count === 1 ? label.noun : `${label.noun}s`;
      return `${label.verb} ${count} ${noun}`;
    })
    .join(", ");
}

export function getActivityGroupIcon(
  entries: AssistantActivityEntry[],
  isStreamingEntry: (entry: AssistantActivityEntry) => boolean
): string {
  const toolEntries = entries.filter((entry) => isToolUIPart(entry.part));
  const representative =
    [...toolEntries].reverse().find((entry) => isStreamingEntry(entry)) ??
    toolEntries[toolEntries.length - 1] ??
    entries[entries.length - 1];

  return representative ? getActivityIcon(representative) : "i-lucide-wrench";
}

export function projectAssistantRenderItems(
  messageId: string,
  parts: UIMessage["parts"],
  subagentProjection: SubagentMessageProjection
): AssistantRenderItem[] {
  const items: AssistantRenderItem[] = [];
  let activityRun: AssistantActivityEntry[] = [];

  function flushActivityRun(): void {
    if (activityRun.length >= 2) {
      items.push({
        kind: "activity-group",
        key: `${messageId}-activity-group-${activityRun[0].partIndex}`,
        activities: activityRun,
      });
    } else if (activityRun.length === 1) {
      const [activity] = activityRun;
      items.push({
        kind: "part",
        key: buildPartKey(messageId, activity.part, activity.partIndex),
        part: activity.part,
        partIndex: activity.partIndex,
      });
    }

    activityRun = [];
  }

  parts.forEach((part, partIndex) => {
    if (isToolUIPart(part)) {
      if (subagentProjection.hiddenPartIndexes.has(partIndex)) return;

      const subagentCall = subagentProjection.rootByPartIndex.get(partIndex);
      if (subagentCall) {
        flushActivityRun();
        items.push({
          kind: "subagent-call",
          key: `${messageId}-subagent-${subagentCall.root.part.toolCallId}`,
          call: subagentCall,
        });
        return;
      }

      activityRun.push({ part: part as ChatToolPart, partIndex });
      return;
    }

    if (isReasoningUIPart(part)) {
      activityRun.push({ part, partIndex });
      return;
    }

    flushActivityRun();
    items.push({
      kind: "part",
      key: buildPartKey(messageId, part, partIndex),
      part,
      partIndex,
    });
  });

  flushActivityRun();
  return items;
}
