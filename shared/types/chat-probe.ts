import type { AcpSessionConfigOption } from "./acp-config";

export type ProbeStatus = "starting" | "ready" | "failed";

export interface ProbeSnapshot {
  agentId: string;
  status: ProbeStatus;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  error?: {
    code: string;
    message: string;
  };
}
