import type {
  SpawnedSessionDisplayStatus,
  SpawnedSessionMessage,
  SpawnedSessionSummary,
} from "@shared/ipc/session/spawned-session.schemas";

export interface SpawnedSessionStatusPresentation {
  label: string;
  icon: string;
  color: "primary" | "success" | "error" | "warning" | "neutral";
}

const STATUS_PRESENTATION: Record<SpawnedSessionDisplayStatus, SpawnedSessionStatusPresentation> = {
  starting: { label: "正在启动…", icon: "i-lucide-loader-circle", color: "primary" },
  running: { label: "正在运行…", icon: "i-lucide-loader-circle", color: "primary" },
  idle: { label: "已完成", icon: "i-lucide-circle-check", color: "success" },
  error: { label: "运行失败", icon: "i-lucide-circle-x", color: "error" },
  expired: { label: "已失效", icon: "i-lucide-clock-alert", color: "warning" },
  interrupted: { label: "已中断", icon: "i-lucide-circle-stop", color: "neutral" },
};

export function spawnedSessionStatusPresentation(
  status: SpawnedSessionDisplayStatus
): SpawnedSessionStatusPresentation {
  return STATUS_PRESENTATION[status];
}

export function isActiveSpawnedSession(summary: SpawnedSessionSummary): boolean {
  return summary.status === "starting" || summary.status === "running";
}

export function sortSpawnedSessionSummaries(
  summaries: SpawnedSessionSummary[]
): SpawnedSessionSummary[] {
  return [...summaries].sort((left, right) => {
    const active = Number(isActiveSpawnedSession(right)) - Number(isActiveSpawnedSession(left));
    return active || right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function spawnedSessionActivityStats(summaries: SpawnedSessionSummary[]): {
  total: number;
  active: number;
} {
  return {
    total: summaries.length,
    active: summaries.filter(isActiveSpawnedSession).length,
  };
}

type SpawnedSessionAssistantMessage = Extract<SpawnedSessionMessage, { role: "assistant" }>;

export interface SpawnedSessionActivityPart {
  part: Exclude<SpawnedSessionAssistantMessage["parts"][number], { type: "text" }>;
  partIndex: number;
}

export interface SpawnedSessionTranscriptEntry {
  id: string;
  text: string;
}

export interface SpawnedSessionContentProjection {
  activities: SpawnedSessionActivityPart[];
  transcript: SpawnedSessionTranscriptEntry[];
}

export function projectSpawnedSessionContent(
  messages: SpawnedSessionMessage[]
): SpawnedSessionContentProjection {
  const activities: SpawnedSessionActivityPart[] = [];
  const transcript: SpawnedSessionTranscriptEntry[] = [];
  let activityIndex = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    message.parts.forEach((part, partIndex) => {
      if (part.type === "text") {
        transcript.push({ id: `${message.id}-text-${partIndex}`, text: part.text });
        return;
      }
      activities.push({ part, partIndex: activityIndex });
      activityIndex += 1;
    });
  }
  return { activities, transcript };
}
