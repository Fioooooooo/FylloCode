import { z } from "zod";

const absolutePathPattern = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/;

export const workspaceFileResourceRefSchema = z
  .object({
    folderId: z.string().min(1),
    worktreePath: z.string().min(1).regex(absolutePathPattern, "worktreePath must be absolute"),
    repositoryRelativePath: z
      .string()
      .min(1)
      .refine((value) => !absolutePathPattern.test(value), {
        message: "repositoryRelativePath must be relative",
      })
      .refine(
        (value) => value.split(/[\\/]/).every((segment) => segment !== ".." && segment !== ""),
        { message: "repositoryRelativePath must not escape the worktree" }
      ),
  })
  .strict();

export const attachmentPromptPartSchema = z
  .object({
    type: z.literal("attachment"),
    attachmentId: z.string().uuid(),
    mediaType: z.string().min(1),
    filename: z.string().min(1),
  })
  .strict();

export const workspaceFilePromptPartSchema = z
  .object({
    type: z.literal("workspace_file"),
    ref: workspaceFileResourceRefSchema,
    mediaType: z.string().min(1),
    filename: z.string().min(1),
  })
  .strict();

export const chatPromptPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    mediaType: z.string().min(1),
    uri: z.string().min(1),
    filename: z.string().min(1),
  }),
  z.object({
    type: z.literal("resource_link"),
    uri: z.string().min(1),
    mediaType: z.string().min(1),
    filename: z.string().min(1),
  }),
  attachmentPromptPartSchema,
  workspaceFilePromptPartSchema,
]);

export type ChatPromptPart = z.infer<typeof chatPromptPartSchema>;
export type WorkspaceFileResourceRef = z.infer<typeof workspaceFileResourceRefSchema>;
