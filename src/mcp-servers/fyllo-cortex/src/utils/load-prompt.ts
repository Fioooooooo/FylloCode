import createMode from "../tools/instructions/guidelines/modes/create.md";
import initMode from "../tools/instructions/guidelines/modes/init.md";
import updateMode from "../tools/instructions/guidelines/modes/update.md";
import archetypes from "../tools/instructions/guidelines/shared/archetypes.md";
import frontmatterContract from "../tools/instructions/guidelines/shared/frontmatter-contract.md";
import qualityRules from "../tools/instructions/guidelines/shared/quality-rules.md";

const sharedContract = [frontmatterContract, qualityRules, archetypes].join("\n\n");

const prompts = {
  "guidelines-init": [initMode, sharedContract].join("\n\n"),
  "guidelines-create": [createMode, sharedContract].join("\n\n"),
  "guidelines-update": [updateMode, sharedContract].join("\n\n"),
} as const;

export type PromptId = keyof typeof prompts;

export function loadPrompt(id: PromptId): string {
  return prompts[id];
}
