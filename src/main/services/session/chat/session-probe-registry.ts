import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { AcpAvailableCommand } from "@shared/types/chat";
import type { ProbeSnapshot, ProbeStatus } from "@shared/types/chat-probe";
import type { SessionWorkspaceSnapshot } from "@shared/types/workspace";

export interface ProbeEntry {
  workspaceId: string;
  agentId: string;
  status: ProbeStatus;
  fylloSessionId: string;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  availableCommands: AcpAvailableCommand[];
  workspaceSnapshot: SessionWorkspaceSnapshot;
  error?: { code: string; message: string };
  startedAt: number;
  inflightEnsure?: Promise<ProbeEntry>;
}

class SessionProbeRegistry {
  private readonly entries = new Map<string, ProbeEntry>();

  get(workspaceId: string, agentId: string): ProbeEntry | undefined {
    return this.entries.get(this.entryKey(workspaceId, agentId));
  }

  set(workspaceId: string, agentId: string, entry: ProbeEntry): void {
    this.entries.set(this.entryKey(workspaceId, agentId), entry);
  }

  delete(workspaceId: string, agentId: string): ProbeEntry | undefined {
    const key = this.entryKey(workspaceId, agentId);
    const entry = this.entries.get(key);
    this.entries.delete(key);
    return entry;
  }

  takeFor(workspaceId: string, agentId: string, expectedAcpSessionId: string): ProbeEntry | null {
    const key = this.entryKey(workspaceId, agentId);
    const entry = this.entries.get(key);
    if (!entry || entry.acpSessionId !== expectedAcpSessionId) {
      return null;
    }
    this.entries.delete(key);
    return entry;
  }

  getForPromotion(
    workspaceId: string,
    agentId: string,
    expectedAcpSessionId: string
  ): ProbeEntry | null {
    const entry = this.get(workspaceId, agentId);
    return entry?.acpSessionId === expectedAcpSessionId ? entry : null;
  }

  deleteWorkspace(workspaceId: string): ProbeEntry[] {
    const removed: ProbeEntry[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.workspaceId === workspaceId) {
        this.entries.delete(key);
        removed.push(entry);
      }
    }
    return removed;
  }

  deleteAgent(agentId: string): ProbeEntry[] {
    const removed: ProbeEntry[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.agentId === agentId) {
        this.entries.delete(key);
        removed.push(entry);
      }
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }

  hasWorkspace(workspaceId: string): boolean {
    return [...this.entries.values()].some((entry) => entry.workspaceId === workspaceId);
  }

  private entryKey(workspaceId: string, agentId: string): string {
    return `${workspaceId}::${agentId}`;
  }
}

export function toProbeSnapshot(entry: ProbeEntry): ProbeSnapshot {
  return {
    agentId: entry.agentId,
    status: entry.status,
    fylloSessionId: entry.fylloSessionId,
    acpSessionId: entry.acpSessionId,
    configOptions: entry.configOptions,
    availableCommands: entry.availableCommands,
    error: entry.error,
  };
}

export const sessionProbeRegistry = new SessionProbeRegistry();
