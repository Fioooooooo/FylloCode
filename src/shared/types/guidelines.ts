import type { RepositoryAggregate } from "./repository-browser";

export type GuidelineRef = {
  folderId: string;
  path: string;
};

export function guidelineRefKey(guidelineRef: GuidelineRef): string {
  return `${guidelineRef.folderId}\0${guidelineRef.path}`;
}

export type GuidelineBrowserItem = {
  ref: GuidelineRef;
  folderName: string;
  path: string;
  name: string;
  description: string | null;
  keywords: string[] | null;
  updatedAt: string;
  content: string;
  parseError?: string;
};

export type GuidelinesBrowserOverview = RepositoryAggregate<GuidelineBrowserItem>;
