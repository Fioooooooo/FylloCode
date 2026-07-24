export interface FylloTagPromptFieldContract {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface FylloTagPromptMetadata {
  purpose: string;
  payloadFields: readonly FylloTagPromptFieldContract[];
  constraints: readonly string[];
  example: Readonly<unknown>;
}

export interface FylloTagPromptTypeContract {
  type: string;
  prompt: FylloTagPromptMetadata;
}

export interface RenderFylloTagPromptContractOptions {
  contractTagName: string;
  publicTagName: string;
  noun: string;
  contracts: readonly FylloTagPromptTypeContract[];
  additionalRules?: readonly string[];
}

function formatTypeContract(contract: FylloTagPromptTypeContract, publicTagName: string): string {
  const example = JSON.stringify(contract.prompt.example, null, 2);
  if (example === undefined) {
    throw new Error(`Fyllo tag prompt example for ${contract.type} must be JSON serializable.`);
  }

  return [
    `- ${contract.type}`,
    `  Purpose: ${contract.prompt.purpose}`,
    `  Required fields: ${
      contract.prompt.payloadFields
        .filter((field) => field.required)
        .map((field) => field.name)
        .join(", ") || "none"
    }`,
    `  Optional fields: ${
      contract.prompt.payloadFields
        .filter((field) => !field.required)
        .map((field) => field.name)
        .join(", ") || "none"
    }`,
    `  Constraints:`,
    ...contract.prompt.constraints.map((constraint) => `    - ${constraint}`),
    `  Executable output example (emit without Markdown fences and keep the surrounding blank lines):`,
    ``,
    `<${publicTagName} type="${contract.type}">`,
    ...example.split("\n"),
    `</${publicTagName}>`,
    ``,
  ].join("\n");
}

export function renderFylloTagPromptContract(options: RenderFylloTagPromptContractOptions): string {
  const enabledTypes = options.contracts.map((contract) => contract.type).join(", ");
  const typeContracts = options.contracts
    .map((contract) => formatTypeContract(contract, options.publicTagName))
    .join("\n");
  const noun = options.noun;

  return [
    `<${options.contractTagName}>`,
    `Rules:`,
    `- Only emit enabled ${noun} types.`,
    `- The only allowed attribute is type.`,
    `- The body must be a strict JSON object matching the enabled type schema.`,
    `- Do not use Markdown code fences, comments, trailing commas, arrays, strings, or bare text inside the tag.`,
    `- When payload text needs literal angle brackets, encode them as \\u003c and \\u003e inside JSON strings.`,
    `- Emit a real ${noun} only as a standalone top-level Markdown block starting at the beginning of a line; indenting it four or more spaces turns it into a code block.`,
    `- If prose precedes the ${noun}, insert a blank line (two newline characters) before the opening tag; never append the opening tag to a prose line.`,
    `- After the closing tag, either end the response or insert a blank line before continuing; never append further text to the closing-tag line.`,
    `- When explaining the public tag syntax or showing a non-executable example, wrap it in inline code or a fenced code block.`,
    ...(options.additionalRules ?? []),
    ``,
    `Enabled ${noun} types: ${enabledTypes}.`,
    ``,
    typeContracts,
    `</${options.contractTagName}>`,
  ].join("\n");
}
