import { registerProposalArchiveHandlers } from "./archive";
import { registerProposalApplyHandlers } from "./apply";
import { registerProposalHandlers } from "./browser";

// Proposal domain registry: browser (list/read/watch), apply (stage streaming), archive.
export function registerProposalIpcHandlers(): void {
  registerProposalHandlers();
  registerProposalApplyHandlers();
  registerProposalArchiveHandlers();
}
