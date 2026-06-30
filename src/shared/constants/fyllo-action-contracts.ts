import type { z } from "zod";
import {
  planCreateFylloActionPayloadSchema,
  taskCreateFylloActionPayloadSchema,
} from "@shared/schemas/fyllo-action";
import type { FylloActionPayloadByType, FylloActionType } from "@shared/types/fyllo-action";

export interface FylloActionPayloadFieldContract {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

type FylloActionContractBase<Type extends FylloActionType> = {
  type: Type;
  description: string;
  payloadSchema: z.ZodType<FylloActionPayloadByType[Type]>;
  payloadFields: readonly FylloActionPayloadFieldContract[];
  examplePayload: FylloActionPayloadByType[Type];
};

export type FylloActionContract = {
  [Type in FylloActionType]: FylloActionContractBase<Type>;
}[FylloActionType];

export const enabledFylloActionContracts = [
  {
    type: "task.create",
    description: "Create a local task after the user confirms the action in FylloCode.",
    payloadSchema: taskCreateFylloActionPayloadSchema,
    payloadFields: [
      {
        name: "title",
        type: "string",
        required: true,
        description: "Required non-empty task title.",
      },
      {
        name: "description",
        type: "string",
        required: false,
        description: "Optional plain-text task description.",
      },
    ],
    examplePayload: {
      title: "Add error handling",
      description: "Capture the agreed follow-up.",
    },
  },
  {
    type: "plan.create",
    description:
      "Open the current chat session plan for review after the user confirms the action in FylloCode.",
    payloadSchema: planCreateFylloActionPayloadSchema,
    payloadFields: [
      {
        name: "slug",
        type: "string",
        required: true,
        description: "Required full plan slug in yyyy-MM-dd-agent-slug format.",
      },
      {
        name: "goal",
        type: "string",
        required: true,
        description: "Required one-sentence summary of what this plan aims to achieve.",
      },
    ],
    examplePayload: {
      slug: "2026-06-29-refactor-chat-store",
      goal: "Review the multi-file implementation plan before code changes.",
    },
  },
] as const satisfies readonly FylloActionContract[];

export function isValidFylloActionTypeName(value: string): boolean {
  return /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value);
}

export function getFylloActionContract(type: string): FylloActionContract | undefined {
  return enabledFylloActionContracts.find((contract) => contract.type === type);
}

function formatPayloadFields(contract: FylloActionContract): string {
  return contract.payloadFields
    .map((field) => {
      const requirement = field.required ? "required" : "optional";
      return `  - ${field.name} (${requirement} ${field.type}): ${field.description}`;
    })
    .join("\n");
}

export function formatFylloActionContractInstructions(
  contracts: readonly FylloActionContract[] = enabledFylloActionContracts
): string {
  if (contracts.length === 0) {
    return [
      "## Fyllo Action Tags",
      "",
      "No Fyllo action types are currently enabled. Do not output `<fyllo-action>` tags.",
    ].join("\n");
  }

  const enabledTypes = contracts.map((contract) => contract.type).join(", ");
  const contractInstructions = contracts
    .map((contract) =>
      [
        `### ${contract.type}`,
        "",
        contract.description,
        "",
        "Payload schema: strict JSON object. Do not include unknown fields.",
        formatPayloadFields(contract),
        "",
        "Minimum valid example:",
        "```xml",
        `<fyllo-action type="${contract.type}">`,
        JSON.stringify(contract.examplePayload),
        "</fyllo-action>",
        "```",
      ].join("\n")
    )
    .join("\n\n");

  return [
    "## Fyllo Action Tags",
    "",
    'Use `<fyllo-action type="...">...</fyllo-action>` only in assistant-visible replies after the user and agent have agreed on a result that needs FylloCode-side confirmation.',
    "The only allowed attribute is `type`. Do not output `version`, `id`, `title`, `confirmLabel`, `cancelLabel`, `handler`, `ipcChannel`, component names, or any other attributes.",
    "The body must be a strict JSON object matching the enabled type schema. Do not use Markdown code fences, comments, trailing commas, arrays, strings, or bare text inside the tag.",
    "FylloCode controls the UI and fixed confirm/cancel buttons. The agent must not define button labels, handlers, IPC channels, or arbitrary UI in attributes or payload.",
    `Enabled action types: ${enabledTypes}.`,
    "",
    contractInstructions,
  ].join("\n");
}
