import { registerGuidelinesHandlers } from "./guidelines";
import { registerKnowledgeHandlers } from "./knowledge";
import { registerLineageHandlers } from "./lineage";
import { registerOverviewHandlers } from "./overview";
import { registerSpecsHandlers } from "./specs";

export function registerInsightIpcHandlers(): void {
  registerLineageHandlers();
  registerOverviewHandlers();
  registerSpecsHandlers();
  registerGuidelinesHandlers();
  registerKnowledgeHandlers();
}
