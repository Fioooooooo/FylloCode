import { z } from "zod";
import type { KnowledgeEntryDraft } from "@shared/types/knowledge";

const knowledgeEntryNamePattern = /^[a-z0-9][a-z0-9-]*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

export const projectRelativePathSchema = z
  .string()
  .min(1)
  .max(300)
  .refine((path) => path.trim() === path, "path must not contain leading or trailing whitespace")
  .refine((path) => !path.startsWith("/"), "path must be project relative")
  .refine((path) => !path.startsWith("~"), "path must not be home relative")
  .refine((path) => !path.includes("\\"), "path must use POSIX separators")
  .refine((path) => !path.includes("\0"), "path must not contain NUL")
  .refine(
    (path) => !path.split("/").some((part) => part === ".."),
    "path must not traverse parent directories"
  );

export const knowledgeEntryNameSchema = z.string().min(1).max(120).regex(knowledgeEntryNamePattern);

export const sha256Schema = z.string().regex(sha256Pattern);

const knowledgeFileAnchorSchema = z.strictObject({
  kind: z.literal("file"),
  file: projectRelativePathSchema,
  hash: sha256Schema,
});

const knowledgePackageAnchorSchema = z.strictObject({
  kind: z.literal("package"),
  package: z.string().min(1).max(214),
  version: z.string().min(1).max(120),
  resolutionDigest: sha256Schema,
});

const knowledgeUrlAnchorSchema = z.strictObject({
  kind: z.literal("url"),
  url: z.string().url(),
  verifiedAt: z.string().datetime(),
  maxAgeDays: z.number().int().positive().max(3650).optional(),
});

export const knowledgeAnchorSchema = z.discriminatedUnion("kind", [
  knowledgeFileAnchorSchema,
  knowledgePackageAnchorSchema,
  knowledgeUrlAnchorSchema,
]);

const knowledgeSessionSourceSchema = z.strictObject({
  kind: z.literal("session"),
  sessionId: z.string().min(1).max(200),
  messageId: z.string().min(1).max(200).optional(),
  actionId: z.string().min(1).max(300).optional(),
});

const knowledgeCommitSourceSchema = z.strictObject({
  kind: z.literal("commit"),
  commitHash: z.string().regex(/^[a-f0-9]{7,64}$/),
});

const knowledgeLineageSourceSchema = z
  .strictObject({
    kind: z.literal("lineage"),
    subjectId: z.string().min(1).max(200).optional(),
    proposalId: z.string().min(1).max(200).optional(),
    commitHash: z
      .string()
      .regex(/^[a-f0-9]{7,64}$/)
      .optional(),
  })
  .superRefine((source, context) => {
    if (!source.subjectId && !source.proposalId && !source.commitHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lineage source must include at least one identifier",
      });
    }
  });

const knowledgeSourceSchema = z.discriminatedUnion("kind", [
  knowledgeSessionSourceSchema,
  knowledgeCommitSourceSchema,
  knowledgeLineageSourceSchema,
]);

export const knowledgeEntryDraftSchema: z.ZodType<KnowledgeEntryDraft> = z
  .strictObject({
    name: knowledgeEntryNameSchema,
    description: z.string().min(1).max(300),
    type: z.enum(["project", "reference", "feedback"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    asOf: z.string().datetime().optional(),
    anchors: z.array(knowledgeAnchorSchema).max(20).optional(),
    source: knowledgeSourceSchema.optional(),
    body: z.string().min(1).max(20_000),
  })
  .superRefine((entry, context) => {
    const hasAnchors = Boolean(entry.anchors?.length);
    if (!entry.source && (!hasAnchors || entry.type === "feedback")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "knowledge entry must include source when it has no anchors or records feedback",
      });
    }
  });
