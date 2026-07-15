import type { InjectionKey } from "vue";
import type { FylloActionState, FylloActionType } from "@shared/fyllo-action/protocol";

export interface FylloActionOrdinalNode {
  type?: string;
  raw?: string;
  content?: string;
}

export interface FylloActionHostContext {
  projectId: string;
  sessionId: string;
  messageIndex: number;
  partIndex: number;
  resolveActionOrdinal: (node: FylloActionOrdinalNode) => number | null;
  getActionState: (actionId: string) => FylloActionState | undefined;
  getRegistrationError: (actionId: string) => string | undefined;
  retryRegistration: (actionId: string, type: FylloActionType) => Promise<void>;
  persistActionState: (actionId: string, state: FylloActionState) => Promise<void>;
  transitionAction: (input: {
    projectId: string;
    sessionId: string;
    actionId: string;
    command: "succeed" | "fail" | "cancel";
    expectedRevision: number;
    error?: string;
  }) => Promise<FylloActionState>;
  transitionActions: (input: {
    projectId: string;
    sessionId: string;
    actionIds: string[];
    command: "succeed" | "fail" | "cancel";
    expectedRevisions: Record<string, number>;
    error?: string;
  }) => Promise<
    Array<{ actionId: string; success: boolean; record?: FylloActionState; error?: string }>
  >;
}

export const fylloActionHostContextKey: InjectionKey<FylloActionHostContext> = Symbol(
  "fyllo-action-host-context"
);
