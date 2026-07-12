import createMode from "../tools/instructions/guidelines/modes/create.md";
import initMode from "../tools/instructions/guidelines/modes/init.md";
import updateMode from "../tools/instructions/guidelines/modes/update.md";
import knowledgeAuditMode from "../tools/instructions/knowledge/modes/audit.md";
import knowledgeCaptureMode from "../tools/instructions/knowledge/modes/capture.md";
import knowledgeRetireMode from "../tools/instructions/knowledge/modes/retire.md";
import knowledgeUpdateMode from "../tools/instructions/knowledge/modes/update.md";
import archetypes from "../tools/instructions/guidelines/shared/archetypes.md";
import frontmatterContract from "../tools/instructions/guidelines/shared/frontmatter-contract.md";
import knowledgeAdmissionTests from "../tools/instructions/knowledge/shared/admission-tests.md";
import knowledgeFrontmatterContract from "../tools/instructions/knowledge/shared/frontmatter-contract.md";
import qualityRules from "../tools/instructions/guidelines/shared/quality-rules.md";

const sharedContract = [frontmatterContract, qualityRules, archetypes].join("\n\n");

const prompts = {
  "guidelines-init": [initMode, sharedContract].join("\n\n"),
  "guidelines-create": [createMode, sharedContract].join("\n\n"),
  "guidelines-update": [updateMode, sharedContract].join("\n\n"),
  "knowledge-capture": [
    knowledgeCaptureMode,
    knowledgeFrontmatterContract,
    knowledgeAdmissionTests,
  ].join("\n\n"),
  "knowledge-update": [knowledgeUpdateMode, knowledgeFrontmatterContract].join("\n\n"),
  "knowledge-retire": [knowledgeRetireMode, knowledgeFrontmatterContract].join("\n\n"),
  "knowledge-audit": [
    knowledgeAuditMode,
    knowledgeFrontmatterContract,
    knowledgeAdmissionTests,
  ].join("\n\n"),
} as const;

export type PromptId = keyof typeof prompts;

export function loadPrompt(id: PromptId): string {
  return prompts[id];
}
