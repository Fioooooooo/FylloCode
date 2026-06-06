export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  metaPath: string;
  healthScore?: number;
  createdAt: Date;
  lastOpenedAt: Date;
  pathMissing?: boolean;
}

export interface ProjectMeta {
  id: string;
  name: string;
  path: string;
  healthScore?: number;
  createdAt: string;
  lastOpenedAt: string;
}

export interface RecentProject {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
  lastOpenedAt: Date;
  pathMissing?: boolean;
}
