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

// The complete agent-facing surface of an action: prompt rendering reads only
// this object, while the sibling top-level fields stay machine-facing.
export interface FylloActionPromptContract<Type extends FylloActionType> {
  purpose: string;
  payloadFields: readonly FylloActionPayloadFieldContract[];
  constraints: readonly string[];
  example: Readonly<FylloActionPayloadByType[Type]>;
}

export interface FylloActionContract<Type extends FylloActionType> {
  type: Type;
  presentation: "inline" | "rail";
  interaction: "confirm";
  payloadSchema: z.ZodType<FylloActionPayloadByType[Type]>;
  prompt: FylloActionPromptContract<Type>;
}

const contracts = {
  "task.create": {
    type: "task.create",
    presentation: "inline",
    interaction: "confirm",
    payloadSchema: taskCreateFylloActionPayloadSchema,
    prompt: {
      purpose:
        "Propose a follow-up task the user can create with one click. The tag renders as an inline card in the chat transcript with fixed confirm/cancel buttons; confirming makes FylloCode create the local task and link this session to it. Do not create the task yourself or restate the payload in surrounding prose.",
      payloadFields: [
        { name: "title", type: "string", required: true, description: "Non-empty task title." },
        {
          name: "description",
          type: "string",
          required: false,
          description: "Optional plain-text task description.",
        },
      ],
      constraints: [
        "title must be non-empty.",
        "Emit at most one task.create per session; multiple task cards confuse the user.",
      ],
      example: {
        title: "Add error handling",
        description: "Capture the agreed follow-up.",
      },
    },
  },
  "plan.create": {
    type: "plan.create",
    presentation: "inline",
    interaction: "confirm",
    payloadSchema: planCreateFylloActionPayloadSchema,
    prompt: {
      purpose:
        "Hand a finished plan to the user for review. The tag renders as an inline card with fixed confirm/cancel buttons; confirming opens the plan document for this slug in FylloCode's review view, where the user reads and approves it. Do not paste the plan body into chat.",
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
        "Emit only after the plan document is fully written, and only once per slug.",
      ],
      example: {
        slug: "2026-06-29-refactor-chat-store",
        goal: "Review the multi-file implementation plan before code changes.",
      },
    },
  },
  "knowledge.flag": {
    type: "knowledge.flag",
    presentation: "rail",
    interaction: "confirm",
    payloadSchema: knowledgeFlagFylloActionPayloadSchema,
    prompt: {
      purpose:
        "Bookmark a reusable, hard-to-rediscover fact the moment it surfaces. The flag renders as a passive card and joins the session event rail; it does not block or prompt the user, so expect no immediate response. When the user later confirms any pending flag, FylloCode bundles all pending flags in the session into one capture request message, and you will be asked to write durable knowledge then. Flagging is not capture: emit it as its own Markdown block, then continue your task after a blank line.",
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
      constraints: [
        "Emit at discovery time as a standalone block — do not wait for the discussion to conclude; if the response continues, leave a blank line after the closing tag before continuing the current task.",
        "summary must be a single line without CR/LF, stating the fact and why it is not cheap to rediscover.",
        "Do not repeat an equivalent pending flag.",
        "Do not include secrets, credentials, or personal data.",
      ],
      example: {
        summary:
          "Payment webhooks arrive out of order, so handlers must stay idempotent — the provider retries without sequencing guarantees.",
        contextPaths: ["src/payments/webhook-handler.ts"],
      },
    },
  },
  "knowledge.review": {
    type: "knowledge.review",
    presentation: "rail",
    interaction: "confirm",
    payloadSchema: knowledgeReviewFylloActionPayloadSchema,
    prompt: {
      purpose:
        "Ask the user to review a durable knowledge entry you just created or updated during capture. The tag renders as a card in the session rail and stays pending there until the user handles it; confirming opens the entry's markdown file from disk in FylloCode's review view, so a pending card always shows the latest saved content. Do not paste the entry body into chat.",
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
      constraints: [
        "name must be a valid knowledge entry name.",
        "Emit only for entries actually created or updated during capture, one action per entry.",
        "Emit at most one review card per entry file: when revising an entry that already has a pending review card, save the file without emitting another — the existing card already opens the revised content.",
      ],
      example: {
        name: "payment-webhook-idempotency",
        summary: "Review the retained guidance on out-of-order payment webhook handling.",
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
