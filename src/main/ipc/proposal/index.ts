import { registerProposalHandlers } from "./browser";

// Proposal domain registry: browser (list/read/watch/status) only.
export function registerProposalIpcHandlers(): void {
  registerProposalHandlers();
}
