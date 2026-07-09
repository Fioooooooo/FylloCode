import { registerProposalArchiveHandlers } from "./archive";
import { registerProposalApplyHandlers } from "./apply";
import { registerProposalHandlers } from "./browser";

export function registerProposalIpcHandlers(): void {
  registerProposalHandlers();
  registerProposalApplyHandlers();
  registerProposalArchiveHandlers();
}
