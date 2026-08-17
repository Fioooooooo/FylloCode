import type { z } from "zod";
import { showTimeSignalPayloadSchema, spawnSessionSignalPayloadSchema } from "./schemas";
import type { FylloSignalPayloadByType, FylloSignalType } from "./protocol";
export type { FylloSignalType } from "./protocol";

export interface FylloSignalPayloadFieldContract {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface FylloSignalPromptContract<Type extends FylloSignalType> {
  purpose: string;
  payloadFields: readonly FylloSignalPayloadFieldContract[];
  constraints: readonly string[];
  example: Readonly<FylloSignalPayloadByType[Type]>;
}

export interface FylloSignalContract<Type extends FylloSignalType> {
  type: Type;
  payloadSchema: z.ZodType<FylloSignalPayloadByType[Type]>;
  prompt: FylloSignalPromptContract<Type>;
}

const contracts = {
  "show.time": {
    type: "show.time",
    payloadSchema: showTimeSignalPayloadSchema,
    prompt: {
      purpose: "Display the current date and time when the user asks for it.",
      payloadFields: [
        {
          name: "label",
          type: "string",
          required: true,
          description: "A short, single-line description of the current date and time.",
        },
      ],
      constraints: [
        "label must be a single non-empty line describing the current date and time.",
        "Emit only once per response; do not repeat for the same time query.",
      ],
      example: {
        label: "2026-07-23 14:30",
      },
    },
  },
  "spawn.session": {
    type: "spawn.session",
    payloadSchema: spawnSessionSignalPayloadSchema,
    prompt: {
      purpose:
        "Display a read-only entry for a newly created spawned Session. The payload is only an opaque query key; Main remains authoritative for ownership, Agent, status, content, and access. Sync mode (background: false) blocks until the task completes, so this Signal appears only after task completion; use the default background mode for better observability.",
      payloadFields: [
        {
          name: "sessionId",
          type: "string",
          required: true,
          description: "The opaque spawned Session identity returned by prompt_to_agent.",
        },
      ],
      constraints: [
        "Emit only after a prompt_to_agent call that omitted sessionId returns a new sessionId; this applies to both synchronous and background creation.",
        "Emit immediately after receiving an accepted result from background new session creation. For sync mode (background: false), emit after the tool completes.",
        "Recommended background flow: start with prompt_to_agent (default background mode), emit this Signal right after the accepted result, poll check_session_status, then read the result with read_response.",
        "Emit exactly once for that newly created Session in the assistant response.",
        "Do not emit for continuation calls, capacity results, or errors without a Session identity.",
        "The Signal is a read-only display pointer. It does not create, restart, continue, cancel, persist, or authorize a spawned Session, and it does not enter the EventRail or Action state machine.",
        "The executable output example below shows the recommended background-mode emission right after the accepted result.",
      ],
      example: {
        sessionId: "spawn_01HZY8K6F5Q2A3B4C7D8E9F0GH",
      },
    },
  },
} as const satisfies Record<FylloSignalType, FylloSignalContract<FylloSignalType>>;

export const fylloSignalContracts = contracts;

export function getFylloSignalContract(
  type: string
): FylloSignalContract<FylloSignalType> | undefined {
  if (!isValidFylloSignalTypeName(type)) {
    return undefined;
  }
  return contracts[type as FylloSignalType];
}

export function isValidFylloSignalTypeName(value: string): boolean {
  return /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value);
}

export const enabledFylloSignalTypes = Object.keys(contracts) as FylloSignalType[];
