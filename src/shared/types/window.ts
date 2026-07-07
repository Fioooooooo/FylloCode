import type { ProjectInfo } from "@shared/types/project";

export type WindowContext =
  | {
      windowId: number;
      role: "launcher";
      projectId: null;
    }
  | {
      windowId: number;
      role: "project";
      projectId: string;
    };

export type OpenProjectWindowResult =
  | {
      status: "bound-current";
      project: ProjectInfo;
      context: Extract<WindowContext, { role: "project" }>;
    }
  | {
      status: "created";
      project: ProjectInfo;
      context: Extract<WindowContext, { role: "project" }>;
    }
  | {
      status: "focused-existing";
      project: ProjectInfo;
      context: Extract<WindowContext, { role: "project" }>;
    };

export type OpenFolderWindowResult = OpenProjectWindowResult | { status: "cancelled" };

export interface OpenLauncherWindowResult {
  context: Extract<WindowContext, { role: "launcher" }>;
}
