import type { z } from "zod";
import { showTimeSignalPayloadSchema } from "./schemas";
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
