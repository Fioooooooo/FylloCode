import guidelines from "../tools/instructions/guidelines.md";

const prompts = {
  guidelines,
} as const;

export type PromptId = keyof typeof prompts;

export function loadPrompt(id: PromptId): string {
  return prompts[id];
}
