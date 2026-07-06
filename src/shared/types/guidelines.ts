export type GuidelineBrowserItem = {
  path: string;
  name: string;
  description: string | null;
  keywords: string[] | null;
  updatedAt: string;
  content: string;
  parseError?: string;
};

export type GuidelinesBrowserOverview = {
  items: GuidelineBrowserItem[];
};
