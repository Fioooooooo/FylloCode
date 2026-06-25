export type SpecScenarioGroup = {
  title: string;
  body: string;
};

export type SpecRequirementGroup = {
  title: string;
  body: string;
  scenarios: SpecScenarioGroup[];
};

export type SpecBrowserItem = {
  id: string;
  purpose: string;
  sourcePath: string;
  updatedAt: string;
  requirementsCount: number;
  scenariosCount: number;
  requirementGroups: SpecRequirementGroup[];
};

export type SpecsBrowserOverview = {
  items: SpecBrowserItem[];
};
