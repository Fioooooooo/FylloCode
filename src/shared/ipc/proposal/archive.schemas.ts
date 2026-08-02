import { workspaceProposalRefSchema } from "./common.schemas";

export const archiveInputSchema = workspaceProposalRefSchema;

export const archiveCancelInputSchema = archiveInputSchema;

export const loadArchiveInputSchema = workspaceProposalRefSchema;

export const loadArchiveMessagesInputSchema = loadArchiveInputSchema;
