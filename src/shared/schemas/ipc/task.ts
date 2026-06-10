import { z } from "zod";
import { taskDescriptionFormats } from "@shared/types/task";

export const taskSourceSchema = z.enum(["local", "yunxiao", "github"]);
export const taskStatusSchema = z.enum(["open", "closed"]);
export const taskDescriptionFormatSchema = z.enum(taskDescriptionFormats);

const taskLabelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
});

const taskUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.string().optional(),
});

const taskDescriptionSchema = z.object({
  format: taskDescriptionFormatSchema,
  content: z.string(),
});

export const listTasksInputSchema = z.object({
  projectId: z.string().min(1),
  source: taskSourceSchema.optional(),
});

export const getTaskInputSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().min(1),
});

export const createTaskInputSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: taskDescriptionSchema.optional(),
});

export const updateTaskInputSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().min(1),
  patch: z.object({
    title: z.string().min(1).optional(),
    description: taskDescriptionSchema.optional(),
    status: taskStatusSchema.optional(),
    labels: z.array(taskLabelSchema).optional(),
    assignee: taskUserSchema.optional(),
  }),
});

export const deleteTaskInputSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().min(1),
});
