import { runMigrations } from "./runner";
import { migrations } from "./scripts";

export async function runAllMigrations(): Promise<void> {
  await runMigrations(migrations);
}
