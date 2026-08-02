export type WindowContext =
  | {
      windowId: number;
      role: "launcher";
      workspaceId: null;
    }
  | {
      windowId: number;
      role: "workspace";
      workspaceId: string;
    };

export type OpenWorkspaceWindowResult =
  | {
      status: "bound-current";
      context: Extract<WindowContext, { role: "workspace" }>;
    }
  | {
      status: "created";
      context: Extract<WindowContext, { role: "workspace" }>;
    }
  | {
      status: "focused-existing";
      context: Extract<WindowContext, { role: "workspace" }>;
    };

export type OpenFolderWindowResult = OpenWorkspaceWindowResult | { status: "cancelled" };

export interface OpenLauncherWindowResult {
  context: Extract<WindowContext, { role: "launcher" }>;
}
