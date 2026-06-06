export type MigrationContext = {
  version: string;
};

export type Migration = {
  id: string;
  migrate: (ctx: MigrationContext) => Promise<void>;
};

export type MigrationRecord = {
  id: string;
  executedAt: string;
  status: "success" | "failed";
  error?: string;
};

export type MigrationStore = {
  baselineId?: string;
  executed: MigrationRecord[];
};
