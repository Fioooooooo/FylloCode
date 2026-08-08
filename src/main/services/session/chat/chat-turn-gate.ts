export type ChatTurnKind = "user" | "notification";

export interface ChatTurnLease {
  workspaceId: string;
  sessionId: string;
  kind: ChatTurnKind;
  release(): void;
}

function gateKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}\0${sessionId}`;
}

export class ChatTurnGate {
  private readonly active = new Map<string, ChatTurnKind>();

  tryAcquire(workspaceId: string, sessionId: string, kind: ChatTurnKind): ChatTurnLease | null {
    const key = gateKey(workspaceId, sessionId);
    if (this.active.has(key)) return null;
    this.active.set(key, kind);
    let released = false;
    return {
      workspaceId,
      sessionId,
      kind,
      release: () => {
        if (released) return;
        released = true;
        this.active.delete(key);
      },
    };
  }

  isActive(workspaceId: string, sessionId: string): boolean {
    return this.active.has(gateKey(workspaceId, sessionId));
  }

  clear(): void {
    this.active.clear();
  }
}

export const chatTurnGate = new ChatTurnGate();
