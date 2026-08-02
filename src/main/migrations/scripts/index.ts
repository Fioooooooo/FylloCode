import { migrate as migrate001 } from "./20260601_001_config-options-camel-case";
import { migrate as migrate002 } from "./20260601_002_installed-at-iso";
import {
  migrate as migrateWorkspaceCutover,
  WORKSPACE_CUTOVER_MIGRATION_ID,
} from "./20260802_001_project-to-workspace";
import {
  CORTEX_WORKSPACE_SCOPE_MIGRATION_ID,
  migrate as migrateCortexWorkspaceScope,
} from "./20260803_001_cortex-workspace-scope";
import {
  migrate as migrateLegacyProjectStorageSettlement,
  WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID,
} from "./20260804_001_retire-legacy-project-storage";
import type { Migration } from "../types";

// 按文件名字母序追加新迁移到此数组末尾，顺序即执行顺序。
export const migrations: Migration[] = [
  { id: "20260601_001_config-options-camel-case", migrate: migrate001 },
  { id: "20260601_002_installed-at-iso", migrate: migrate002 },
  { id: WORKSPACE_CUTOVER_MIGRATION_ID, migrate: migrateWorkspaceCutover },
  { id: CORTEX_WORKSPACE_SCOPE_MIGRATION_ID, migrate: migrateCortexWorkspaceScope },
  {
    id: WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID,
    migrate: migrateLegacyProjectStorageSettlement,
    retryPolicy: "until-success",
  },
];
