import { fylloActionContracts } from "./registry";
import type { FylloActionContract, FylloActionType } from "./registry";

export interface FylloActionPromptSection {
  id: "fyllo-action-contract";
  content: string;
}

function formatActionContract<Type extends FylloActionType>(
  contract: FylloActionContract<Type>
): string {
  const example = JSON.stringify(contract.prompt.example, null, 2);

  return [
    `- ${contract.type}`,
    `  Purpose: ${contract.prompt.purpose}`,
    `  Required fields: ${
      contract.prompt.payloadFields
        .filter((f) => f.required)
        .map((f) => f.name)
        .join(", ") || "none"
    }`,
    `  Optional fields: ${
      contract.prompt.payloadFields
        .filter((f) => !f.required)
        .map((f) => f.name)
        .join(", ") || "none"
    }`,
    `  Constraints:`,
    ...contract.prompt.constraints.map((c) => `    - ${c}`),
    `  Example:`,
    `  <fyllo-action type="${contract.type}">`,
    ...example.split("\n").map((line) => `  ${line}`),
    `  </fyllo-action>`,
  ].join("\n");
}

export function renderFylloActionPromptContract(): string {
  const contracts = Object.values(fylloActionContracts);
  const enabledTypes = contracts.map((contract) => contract.type).join(", ");

  const actionContracts = contracts.map((contract) => formatActionContract(contract)).join("\n\n");

  return [
    `<fyllo-action-contract>`,
    `Rules:`,
    `- Only emit enabled action types.`,
    `- The only allowed attribute is type.`,
    `- The body must be a strict JSON object matching the enabled type schema.`,
    `- Do not use Markdown code fences, comments, trailing commas, arrays, strings, or bare text inside the tag.`,
    `- When payload text needs literal angle brackets, encode them as \\u003c and \\u003e inside JSON strings.`,
    `- Emit a real action only as a standalone top-level Markdown block with no explanatory text before the opening tag or after the closing tag.`,
    `- When explaining the public tag syntax or showing a non-executable example, wrap it in inline code or a fenced code block.`,
    ``,
    `Enabled action types: ${enabledTypes}.`,
    ``,
    actionContracts,
    `</fyllo-action-contract>`,
  ].join("\n");
}

export function buildFylloActionPromptSection(): FylloActionPromptSection {
  return {
    id: "fyllo-action-contract",
    content: renderFylloActionPromptContract(),
  };
}
