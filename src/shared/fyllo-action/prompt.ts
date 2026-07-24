import { fylloActionContracts } from "./registry";
import { renderFylloTagPromptContract } from "@shared/fyllo-markdown/prompt-contract";

export interface FylloActionPromptSection {
  id: "fyllo-action-contract";
  content: string;
}

export function renderFylloActionPromptContract(): string {
  return renderFylloTagPromptContract({
    contractTagName: "fyllo-action-contract",
    publicTagName: "fyllo-action",
    noun: "action",
    contracts: Object.values(fylloActionContracts),
  });
}

export function buildFylloActionPromptSection(): FylloActionPromptSection {
  return {
    id: "fyllo-action-contract",
    content: renderFylloActionPromptContract(),
  };
}
