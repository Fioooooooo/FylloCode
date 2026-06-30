import explore from "../tools/instructions/explore.md";
import createPlan from "../tools/instructions/create-plan.md";
import createProposal from "../tools/instructions/create-proposal.md";
import applyChange from "../tools/instructions/apply-change.md";
import archiveChange from "../tools/instructions/archive-change.md";

const prompts = {
  explore,
  "create-plan": createPlan,
  "create-proposal": createProposal,
  "apply-change": applyChange,
  "archive-change": archiveChange,
} as const;

export type PromptId = keyof typeof prompts;

export function loadPrompt(id: PromptId): string {
  return prompts[id];
}
