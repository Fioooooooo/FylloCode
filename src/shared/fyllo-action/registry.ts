import type { z } from "zod";
import {
  knowledgeFlagFylloActionPayloadSchema,
  knowledgeReviewFylloActionPayloadSchema,
  planCreateFylloActionPayloadSchema,
  taskCreateFylloActionPayloadSchema,
} from "./schemas";
import type { FylloActionPayloadByType, FylloActionType } from "./protocol";
export type { FylloActionType } from "./protocol";

export interface FylloActionPayloadFieldContract {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface FylloActionPromptContract {
  purpose: string;
  payloadFields: readonly FylloActionPayloadFieldContract[];
  constraints: readonly string[];
  example: unknown;
}

export interface FylloActionContract<Type extends FylloActionType> {
  type: Type;
  description: string;
  presentation: "inline" | "rail";
  interaction: "confirm";
  payloadSchema: z.ZodType<FylloActionPayloadByType[Type]>;
  payloadFields: readonly FylloActionPayloadFieldContract[];
  examplePayload: Readonly<FylloActionPayloadByType[Type]>;
  prompt: FylloActionPromptContract;
}

const contracts = {
  "task.create": {
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
    prompt: {
      purpose: "Create a local task after the user confirms.",
      payloadFields: [
        { name: "title", type: "string", required: true, description: "Non-empty task title." },
        {
          name: "description",
          type: "string",
          required: false,
          description: "Optional plain-text task description.",
        },
      ],
      constraints: ["title must be non-empty."],
      example: {
        title: "Add error handling",
        description: "Capture the agreed follow-up.",
      },
    },
  },
  "plan.create": {
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
    prompt: {
      purpose: "Let the user review an implementation plan before coding.",
      payloadFields: [
        {
          name: "slug",
          type: "string",
          required: true,
          description: "Full plan slug in yyyy-MM-dd-slug format.",
        },
        {
          name: "goal",
          type: "string",
          required: true,
          description: "One-sentence summary of what the plan aims to achieve.",
        },
      ],
      constraints: [
        "slug must match yyyy-MM-dd-slug format.",
        "slug must not contain path separators, dots, or whitespace.",
      ],
      example: {
        slug: "2026-06-29-refactor-chat-store",
        goal: "Review the multi-file implementation plan before code changes.",
      },
    },
  },
  "knowledge.flag": {
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
    prompt: {
      purpose: "Flag a concise knowledge candidate for later review and capture.",
      payloadFields: [
        {
          name: "summary",
          type: "string",
          required: true,
          description: "One-line summary of the candidate fact.",
        },
        {
          name: "contextPaths",
          type: "string[]",
          required: false,
          description: "Project-relative files or directories supporting the candidate.",
        },
      ],
      constraints: ["summary must be a single line without CR/LF."],
      example: {
        summary:
          "Message markdown theme subscriptions are expensive when each text part creates an instance.",
        contextPaths: ["src/renderer/src/components/chat/MessageMarkdown.vue"],
      },
    },
  },
  "knowledge.review": {
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
    prompt: {
      purpose: "Ask the user to review an existing knowledge markdown file.",
      payloadFields: [
        {
          name: "name",
          type: "string",
          required: true,
          description: "Knowledge entry file name without the .md suffix.",
        },
        {
          name: "summary",
          type: "string",
          required: false,
          description: "Optional concise summary to show in the review card.",
        },
      ],
      constraints: ["name must be a valid knowledge entry name."],
      example: {
        name: "markstream-vue-theme-subscription",
        summary: "Review the retained guidance for MessageMarkdown theme subscriptions.",
      },
    },
  },
} as const satisfies Record<FylloActionType, FylloActionContract<FylloActionType>>;

export const fylloActionContracts = contracts;

export function getFylloActionContract(
  type: string
): FylloActionContract<FylloActionType> | undefined {
  if (!isValidFylloActionTypeName(type)) {
    return undefined;
  }
  return contracts[type as FylloActionType];
}

// Validates a Fyllo action type name such as `task.create` or `knowledge.flag`.
// Format: lower-case kebab segments joined by dots, at least two segments.
export function isValidFylloActionTypeName(value: string): boolean {
  return /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value);
}

export const enabledFylloActionTypes = Object.keys(contracts) as FylloActionType[];
