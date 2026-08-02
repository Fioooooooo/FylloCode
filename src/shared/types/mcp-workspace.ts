import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { workspaceKindSchema } from "./workspace";

export const MAX_MCP_WORKSPACE_CONTEXT_BYTES = 64 * 1024;
export const FYLLO_WORKSPACE_CONTEXT_HEADER = "x-fyllo-workspace-context";

function isCanonicalAbsolutePath(value: string): boolean {
  return isAbsolute(value) && value === resolve(value);
}

const canonicalAbsolutePathSchema = z.string().min(1).refine(isCanonicalAbsolutePath, {
  message: "Path must be a canonical absolute path",
});

export const mcpFolderEntrySchema = z
  .object({
    folderId: z.string().min(1),
    folderName: z.string().min(1),
    folderPath: canonicalAbsolutePathSchema,
  })
  .strict();

export const mcpWorkspaceDescriptorV2Schema = z
  .object({
    version: z.literal(2),
    workspaceId: z.string().min(1),
    workspaceKind: workspaceKindSchema,
    primaryFolderId: z.string().min(1),
    folders: z.array(mcpFolderEntrySchema).min(1).max(16),
    workspaceDataDir: canonicalAbsolutePathSchema,
    mcpEventDir: canonicalAbsolutePathSchema.optional(),
    sessionId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((descriptor, ctx) => {
    const folderIds = new Set<string>();
    let primaryMatches = 0;

    descriptor.folders.forEach((folder, index) => {
      if (folderIds.has(folder.folderId)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate folderId: ${folder.folderId}`,
          path: ["folders", index, "folderId"],
        });
      }
      folderIds.add(folder.folderId);
      if (folder.folderId === descriptor.primaryFolderId) {
        primaryMatches += 1;
      }
    });

    if (primaryMatches !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "primaryFolderId must match exactly one Folder",
        path: ["primaryFolderId"],
      });
    }
  });

export type McpFolderEntry = z.infer<typeof mcpFolderEntrySchema>;
export type McpWorkspaceDescriptorV2 = z.infer<typeof mcpWorkspaceDescriptorV2Schema>;

function freezeDescriptor(descriptor: McpWorkspaceDescriptorV2): McpWorkspaceDescriptorV2 {
  for (const folder of descriptor.folders) {
    Object.freeze(folder);
  }
  Object.freeze(descriptor.folders);
  return Object.freeze(descriptor);
}

export function parseMcpWorkspaceDescriptor(input: unknown): McpWorkspaceDescriptorV2 {
  return freezeDescriptor(mcpWorkspaceDescriptorV2Schema.parse(input));
}

export function serializeMcpWorkspaceDescriptor(input: unknown): string {
  const serialized = JSON.stringify(parseMcpWorkspaceDescriptor(input));
  if (Buffer.byteLength(serialized, "utf8") > MAX_MCP_WORKSPACE_CONTEXT_BYTES) {
    throw new Error("MCP Workspace descriptor exceeds the maximum serialized size");
  }
  return serialized;
}

export function deserializeMcpWorkspaceDescriptor(serialized: string): McpWorkspaceDescriptorV2 {
  if (Buffer.byteLength(serialized, "utf8") > MAX_MCP_WORKSPACE_CONTEXT_BYTES) {
    throw new Error("MCP Workspace descriptor exceeds the maximum serialized size");
  }

  let input: unknown;
  try {
    input = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("MCP Workspace descriptor must be valid JSON");
  }
  return parseMcpWorkspaceDescriptor(input);
}
