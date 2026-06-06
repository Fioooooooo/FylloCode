import type { AcpSessionConfigOption } from "./acp-config";
import type { AcpAvailableCommand } from "./chat";

export type ProbeStatus = "starting" | "ready" | "failed";

export interface ProbeSnapshot {
  agentId: string;
  status: ProbeStatus;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  availableCommands: AcpAvailableCommand[];
  error?: {
    code: string;
    message: string;
  };
}
