import { z } from "zod";

const themeModeSchema = z.enum(["light", "dark", "system"]);
const agentModeSchema = z.enum(["auto", "manual"]);
const notificationMethodSchema = z.enum(["system", "sound", "in-app"]);
const budgetUnitSchema = z.enum(["tokens", "usd"]);
const tokenStatsPeriodSchema = z.enum(["daily", "weekly", "monthly"]);

const budgetAlertSchema = z.object({
  value: z.number(),
  unit: budgetUnitSchema,
});

export const getSettingsInputSchema = z.object({}).strict();

export const getAppInfoInputSchema = z.object({}).strict();

export const updateSettingsInputSchema = z
  .object({
    theme: themeModeSchema.optional(),
    language: z.string().min(1).optional(),
    defaultAgentMode: agentModeSchema.optional(),
    notificationMethods: z.array(notificationMethodSchema).optional(),
    autoSaveSession: z.boolean().optional(),
    tokenStatsPeriod: tokenStatsPeriodSchema.optional(),
    budgetAlert: budgetAlertSchema.optional(),
  })
  .strict();
