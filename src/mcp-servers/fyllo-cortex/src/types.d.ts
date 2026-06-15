export type GuidelineEntry = {
  path: string;
  name: string;
  description: string | null;
  keywords: string[] | null;
  parseError?: string;
};

declare module "*.md" {
  const content: string;
  export default content;
}
