import { renderFylloTagPromptContract } from "@shared/fyllo-markdown/prompt-contract";
import { fylloSignalContracts } from "./registry";

export interface FylloSignalPromptSection {
  id: "fyllo-signal-contract";
  content: string;
}

export function renderFylloSignalPromptContract(): string {
  return renderFylloTagPromptContract({
    contractTagName: "fyllo-signal-contract",
    publicTagName: "fyllo-signal",
    noun: "signal",
    contracts: Object.values(fylloSignalContracts),
    additionalRules: [
      "- Signals are passive display markers. They require no user action and do not appear in the session event rail.",
    ],
  });
}

export function buildFylloSignalPromptSection(): FylloSignalPromptSection {
  return {
    id: "fyllo-signal-contract",
    content: renderFylloSignalPromptContract(),
  };
}
