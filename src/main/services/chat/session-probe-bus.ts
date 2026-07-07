import { EventEmitter } from "events";
import type { ProbeSnapshot } from "@shared/types/chat-probe";

export interface SessionProbeUpdatePayload {
  projectId: string;
  agentId: string;
  snapshot: ProbeSnapshot | null;
}

class SessionProbeBus extends EventEmitter {
  emitUpdate(payload: SessionProbeUpdatePayload): boolean {
    return super.emit("update", payload);
  }

  onUpdate(listener: (payload: SessionProbeUpdatePayload) => void): this {
    return super.on("update", listener);
  }

  offUpdate(listener: (payload: SessionProbeUpdatePayload) => void): this {
    return super.off("update", listener);
  }
}

export const sessionProbeBus = new SessionProbeBus();
