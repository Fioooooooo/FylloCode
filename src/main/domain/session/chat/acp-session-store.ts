export interface AcpSessionStore {
  loadAcpSessionId(): Promise<string | null>;
  persistAcpSessionId(acpSessionId: string): Promise<void>;
}
