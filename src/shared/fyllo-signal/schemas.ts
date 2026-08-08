import { z } from "zod";

export const fylloSignalTypeSchema = z.enum(["show.time", "spawn.session"]);

export const showTimeSignalPayloadSchema = z.strictObject({
  label: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\r\n]+$/),
});

// Spawned Session identity is an opaque storage key, never a caller-controlled path.
export const spawnSessionSignalPayloadSchema = z.strictObject({
  sessionId: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[^/\\\0]+$/),
});
