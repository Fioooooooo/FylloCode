import type { RepositoryAggregate } from "./repository-browser";

export type SpecScenarioGroup = {
  title: string;
  body: string;
};

export type SpecRequirementGroup = {
  title: string;
  body: string;
  scenarios: SpecScenarioGroup[];
};

export type SpecRef = {
  folderId: string;
  specId: string;
};

export function specRefKey(specRef: SpecRef): string {
  return `${specRef.folderId}\0${specRef.specId}`;
}

export type SpecBrowserItem = {
  id: string;
  ref: SpecRef;
  folderName: string;
  purpose: string;
  sourcePath: string;
  updatedAt: string;
  requirementsCount: number;
  scenariosCount: number;
  requirementGroups: SpecRequirementGroup[];
};

export type SpecsBrowserOverview = RepositoryAggregate<SpecBrowserItem>;
