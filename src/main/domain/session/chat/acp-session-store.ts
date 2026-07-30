import type { AcpSessionConfigOption } from "@shared/types/acp-config";

export interface AcpSessionRecoveryState {
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
}

export interface AcpSessionStore {
  loadRecoveryState(): Promise<AcpSessionRecoveryState>;
  persistAcpSessionId(acpSessionId: string): Promise<void>;
}
