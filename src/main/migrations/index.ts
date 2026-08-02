import { runMigrations } from "./runner";
import { migrations } from "./scripts";

export { WORKSPACE_CUTOVER_MIGRATION_ID } from "./scripts/20260802_001_project-to-workspace";
export { WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID } from "./scripts/20260804_001_retire-legacy-project-storage";
export {
  getRequiredMigrationStatus,
  validateWorkspaceCutoverState,
  type RequiredMigrationStatus,
  type WorkspaceCutoverValidationIssue,
  type WorkspaceCutoverValidationResult,
} from "./runner";

export async function runAllMigrations(): Promise<void> {
  await runMigrations(migrations);
}
