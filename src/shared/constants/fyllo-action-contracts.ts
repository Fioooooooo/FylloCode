import type { z } from "zod";
import {
  knowledgeFlagFylloActionPayloadSchema,
  knowledgeReviewFylloActionPayloadSchema,
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
  presentation: "inline" | "rail";
  interaction: "passive" | "confirm";
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
    description:
      "Show the user a card to create a task; after the user confirms, a local task will be created.",
    presentation: "inline",
    interaction: "confirm",
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
    description: "Show the user a card to review the plan.",
    presentation: "inline",
    interaction: "confirm",
    payloadSchema: planCreateFylloActionPayloadSchema,
    payloadFields: [
      {
        name: "slug",
        type: "string",
        required: true,
        description: "Required full plan slug in yyyy-MM-dd-slug format.",
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
  {
    type: "knowledge.flag",
    description:
      "Show a knowledge candidate in the session rail; when the user confirms, FylloCode starts durable knowledge capture.",
    presentation: "rail",
    interaction: "confirm",
    payloadSchema: knowledgeFlagFylloActionPayloadSchema,
    payloadFields: [
      {
        name: "summary",
        type: "string",
        required: true,
        description: "Required concise summary of knowledge that may be worth retaining.",
      },
      {
        name: "contextPaths",
        type: "string[]",
        required: false,
        description: "Optional project-relative files or directories that support the candidate.",
      },
    ],
    examplePayload: {
      summary:
        "Message markdown theme subscriptions are expensive when each text part creates an instance.",
      contextPaths: ["src/renderer/src/components/chat/MessageMarkdown.vue"],
    },
  },
  {
    type: "knowledge.review",
    description: "Show the user a card to review a durable knowledge markdown file from disk.",
    presentation: "rail",
    interaction: "confirm",
    payloadSchema: knowledgeReviewFylloActionPayloadSchema,
    payloadFields: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Required knowledge entry file name without the .md suffix.",
      },
      {
        name: "summary",
        type: "string",
        required: false,
        description: "Optional concise summary to show in the review card.",
      },
    ],
    examplePayload: {
      name: "markstream-vue-theme-subscription",
      summary: "Review the retained guidance for MessageMarkdown theme subscriptions.",
    },
  },
] as const satisfies readonly FylloActionContract[];

// Validates a Fyllo action type name such as `task.create` or `knowledge.flag`.
// Format: lower-case kebab segments joined by dots, at least two segments.
export function isValidFylloActionTypeName(value: string): boolean {
  return /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value);
}

export function getFylloActionContract(type: string): FylloActionContract | undefined {
  return enabledFylloActionContracts.find((contract) => contract.type === type);
}

function formatPayloadFields(contract: FylloActionContract): string {
  // Render each schema field as a prompt-friendly bullet with requirement level and type.
  return contract.payloadFields
    .map((field) => {
      const requirement = field.required ? "required" : "optional";
      return `  - ${field.name} (${requirement} ${field.type}): ${field.description}`;
    })
    .join("\n");
}

/**
 * Build the `<fyllo-action-definition>` prompt fragment that tells the model which
 * Fyllo action types are enabled, their schemas, examples, and output constraints.
 */
export function formatFylloActionContractForPrompt(
  contracts: readonly FylloActionContract[] = enabledFylloActionContracts
): string {
  // When no actions are enabled, emit a clear prohibition to prevent model hallucination.
  if (contracts.length === 0) {
    return [
      `<fyllo-action-definition>`,
      "## Fyllo Action Tags",
      "",
      "No Fyllo action types are currently enabled. Do not output `<fyllo-action>` tags.",
      `</fyllo-action-definition>`,
    ].join("\n");
  }

  // Build one instruction block per enabled action type: description, schema, example.
  const enabledTypes = contracts.map((contract) => contract.type).join(", ");
  const contractInstructions = contracts
    .map((contract) =>
      [
        `### ${contract.type}`,
        "",
        contract.description,
        "",
        `Presentation: ${contract.presentation}. Interaction: ${contract.interaction}.`,
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

  // Assemble the global constraints followed by the per-type instructions.
  return [
    `<fyllo-action-definition>`,
    "## Fyllo Action Tags",
    "",
    'Use `<fyllo-action type="...">...</fyllo-action>` only in assistant-visible replies after the user and agent have agreed on a result that needs FylloCode-side confirmation.',
    "The only allowed attribute is `type`. Do not output `version`, `id`, `title`, `confirmLabel`, `cancelLabel`, `handler`, `ipcChannel`, component names, or any other attributes.",
    "The body must be a strict JSON object matching the enabled type schema. Do not use Markdown code fences, comments, trailing commas, arrays, strings, or bare text inside the tag.",
    "When payload text needs literal angle brackets, encode them as `\\u003c` and `\\u003e` inside JSON strings.",
    "FylloCode controls the UI and fixed confirm/cancel buttons. The agent must not define button labels, handlers, or arbitrary UI in attributes or payload.",
    `Enabled action types: ${enabledTypes}.`,
    "",
    contractInstructions,
    "",
    `</fyllo-action-definition>`,
  ].join("\n");
}
