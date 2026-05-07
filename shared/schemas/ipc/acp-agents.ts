import { z } from "zod";

export const installAgentInputSchema = z.string().min(1);
