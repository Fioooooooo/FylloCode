import type { FylloActionState } from "@shared/fyllo-action/protocol";
import {
  isFylloActionResolved as sharedIsResolved,
  requiresFylloActionAttention as sharedRequiresAttention,
} from "@shared/fyllo-action/state";

export function isFylloActionResolved(state: FylloActionState): boolean {
  return sharedIsResolved(state);
}

export function requiresFylloActionAttention(state: FylloActionState): boolean {
  return sharedRequiresAttention(state);
}

export function isFylloActionTerminalState(state: FylloActionState): boolean {
  return sharedIsResolved(state);
}
