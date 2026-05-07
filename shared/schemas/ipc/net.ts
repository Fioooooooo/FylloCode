import { z } from "zod";

export const netFetchInputSchema = z.string().url();
