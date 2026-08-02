/** Legacy Project record read only by the Project-to-Workspace upgrade migration. */
export interface LegacyProjectMeta {
  id: string;
  name: string;
  path: string;
  healthScore?: number;
  createdAt: string;
  lastOpenedAt: string;
}
