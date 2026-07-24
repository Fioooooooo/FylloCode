import { z } from "zod";

export const fylloSignalTypeSchema = z.enum(["show.time"]);

export const showTimeSignalPayloadSchema = z.strictObject({
  label: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\r\n]+$/),
});
