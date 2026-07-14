import { z } from "zod";
import {
  registerFylloActionInputSchema,
  transitionFylloActionInputSchema,
  transitionFylloActionsInputSchema,
} from "@shared/fyllo-action/schemas";

export const registerActionInputSchema = registerFylloActionInputSchema;
export type RegisterActionInput = z.infer<typeof registerActionInputSchema>;

export const transitionActionInputSchema = transitionFylloActionInputSchema;
export type TransitionActionInput = z.infer<typeof transitionActionInputSchema>;

export const transitionActionsInputSchema = transitionFylloActionsInputSchema;
export type TransitionActionsInput = z.infer<typeof transitionActionsInputSchema>;
