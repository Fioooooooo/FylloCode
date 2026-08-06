import type { AcpSessionConfigOption } from "./acp-config";
import type { AcpAvailableCommand, ChatSessionMode } from "./chat";

export type ProbeStatus = "starting" | "ready" | "failed";

export interface ProbeSnapshot {
  agentId: string;
  sessionMode: ChatSessionMode;
  status: ProbeStatus;
  fylloSessionId: string;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  availableCommands: AcpAvailableCommand[];
  error?: {
    code: string;
    message: string;
  };
}
