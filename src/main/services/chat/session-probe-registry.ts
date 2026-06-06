import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import type { AcpAvailableCommand } from "@shared/types/chat";
import type { ProbeSnapshot, ProbeStatus } from "@shared/types/chat-probe";

export interface ProbeEntry {
  agentId: string;
  status: ProbeStatus;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  availableCommands: AcpAvailableCommand[];
  error?: { code: string; message: string };
  startedAt: number;
  inflightEnsure?: Promise<ProbeEntry>;
}

class SessionProbeRegistry {
  private readonly entries = new Map<string, ProbeEntry>();

  get(agentId: string): ProbeEntry | undefined {
    return this.entries.get(agentId);
  }

  set(agentId: string, entry: ProbeEntry): void {
    this.entries.set(agentId, entry);
  }

  delete(agentId: string): ProbeEntry | undefined {
    const entry = this.entries.get(agentId);
    this.entries.delete(agentId);
    return entry;
  }

  takeFor(agentId: string, expectedAcpSessionId: string): ProbeEntry | null {
    const entry = this.entries.get(agentId);
    if (!entry || entry.acpSessionId !== expectedAcpSessionId) {
      return null;
    }
    this.entries.delete(agentId);
    return entry;
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}

export function toProbeSnapshot(entry: ProbeEntry): ProbeSnapshot {
  return {
    agentId: entry.agentId,
    status: entry.status,
    acpSessionId: entry.acpSessionId,
    configOptions: entry.configOptions,
    availableCommands: entry.availableCommands,
    error: entry.error,
  };
}

export const sessionProbeRegistry = new SessionProbeRegistry();
