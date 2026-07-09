import { registerGuidelinesHandlers } from "./guidelines";
import { registerLineageHandlers } from "./lineage";
import { registerOverviewHandlers } from "./overview";
import { registerSpecsHandlers } from "./specs";

export function registerInsightIpcHandlers(): void {
  registerLineageHandlers();
  registerOverviewHandlers();
  registerSpecsHandlers();
  registerGuidelinesHandlers();
}
