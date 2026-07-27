import type { LocalFilePreviewResult } from "@shared/types/local-file-preview";

export type LocalFilePreviewState =
  { status: "idle" } | { status: "loading"; requestedPath: string } | LocalFilePreviewResult;
