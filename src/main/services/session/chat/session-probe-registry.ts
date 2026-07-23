import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { AcpAvailableCommand } from "@shared/types/chat";
import type { ProbeSnapshot, ProbeStatus } from "@shared/types/chat-probe";

export interface ProbeEntry {
  projectId: string;
  agentId: string;
  status: ProbeStatus;
  fylloSessionId: string;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  availableCommands: AcpAvailableCommand[];
  error?: { code: string; message: string };
  startedAt: number;
  inflightEnsure?: Promise<ProbeEntry>;
}

class SessionProbeRegistry {
  private readonly entries = new Map<string, ProbeEntry>();

  get(projectId: string, agentId: string): ProbeEntry | undefined {
    return this.entries.get(this.entryKey(projectId, agentId));
  }

  set(projectId: string, agentId: string, entry: ProbeEntry): void {
    this.entries.set(this.entryKey(projectId, agentId), entry);
  }

  delete(projectId: string, agentId: string): ProbeEntry | undefined {
    const key = this.entryKey(projectId, agentId);
    const entry = this.entries.get(key);
    this.entries.delete(key);
    return entry;
  }

  takeFor(projectId: string, agentId: string, expectedAcpSessionId: string): ProbeEntry | null {
    const key = this.entryKey(projectId, agentId);
    const entry = this.entries.get(key);
    if (!entry || entry.acpSessionId !== expectedAcpSessionId) {
      return null;
    }
    this.entries.delete(key);
    return entry;
  }

  deleteProject(projectId: string): ProbeEntry[] {
    const removed: ProbeEntry[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.projectId === projectId) {
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

  private entryKey(projectId: string, agentId: string): string {
    return `${projectId}::${agentId}`;
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
