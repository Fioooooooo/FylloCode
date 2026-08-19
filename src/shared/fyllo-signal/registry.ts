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
        "Optionally display a read-only contextual deep link to a spawned Session when retaining that link in the current response is useful. Main-owned inspection automatically discovers and updates owner-matched spawned Sessions, so this Signal is not required for discovery or status observability. The payload is only an opaque query key; Main remains authoritative for ownership, Agent, status, content, and access.",
      payloadFields: [
        {
          name: "sessionId",
          type: "string",
          required: true,
          description: "The opaque spawned Session identity returned by prompt_to_agent.",
        },
      ],
      constraints: [
        "Emit at most once when a new Session identity is available and a contextual deep link adds value to the current assistant response; the Main-owned activity view remains complete without it.",
        "A background prompt_to_agent call returns accepted before the turn is terminal; the activity view discovers the Session immediately and updates it through Main-owned view wake.",
        "For sync mode (background: false), the call blocks until the turn settles; the activity view still uses the same owner-scoped Session identity and durable detail.",
        "Do not emit for continuation calls, capacity results, or errors without a Session identity; continuation turns keep the same identity and do not require a repeated Signal.",
        "The Signal is a read-only display pointer. It does not create, restart, continue, cancel, persist, or authorize a spawned Session, and it does not enter the EventRail or Action state machine.",
        "The executable output example below shows the optional deep-link form; it is not a replacement for Main-owned discovery.",
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
