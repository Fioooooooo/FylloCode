import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "fs";
import { readFileSync } from "fs";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-provider-stores-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import {
  clearCredentials,
  credentialPath,
  loadCredentials,
  saveCredentials,
} from "@main/infra/storage/provider-credential-store";
import {
  getConnection,
  listConnections,
  removeConnection,
  saveConnection,
} from "@main/infra/storage/provider-connection-store";
import {
  createEmptyWorkspaceIntegrationConfig,
  loadWorkspaceIntegrationConfig,
  workspaceIntegrationPath,
  saveWorkspaceIntegrationConfig,
  setStageResources,
} from "@main/infra/storage/workspace-integration-store";

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("provider credential store", () => {
  it("keeps provider credentials under integrations/credentials", () => {
    expect(credentialPath("yunxiao")).toBe(`${tempRoot}/integrations/credentials/yunxiao.json`);
  });

  it("round-trips provider credentials", () => {
    saveCredentials("yunxiao", {
      "x-yunxiao-token": "token-1234",
      organizationId: "org-1",
    });

    expect(loadCredentials("yunxiao")).toEqual({
      "x-yunxiao-token": "token-1234",
      organizationId: "org-1",
    });

    clearCredentials("yunxiao");
    expect(loadCredentials("yunxiao")).toEqual({});
  });
});

describe("provider connection store", () => {
  it("keeps provider connections in integrations/connections.json", () => {
    saveConnection({
      providerId: "yunxiao",
      state: "connected",
      accountName: "demo@example.com",
      connectedAt: "2026-05-13T00:00:00.000Z",
      credentialPreview: { "x-yunxiao-token": "toke****1234" },
    });

    expect(
      JSON.parse(readFileSync(`${tempRoot}/integrations/connections.json`, "utf8"))
    ).toMatchObject({
      yunxiao: {
        providerId: "yunxiao",
        state: "connected",
      },
    });
  });

  it("persists connections by providerId", () => {
    saveConnection({
      providerId: "yunxiao",
      state: "connected",
      accountName: "demo@example.com",
      connectedAt: "2026-05-13T00:00:00.000Z",
      credentialPreview: { "x-yunxiao-token": "toke****1234" },
    });

    expect(getConnection("yunxiao")).toEqual(
      expect.objectContaining({
        providerId: "yunxiao",
        state: "connected",
      })
    );
    expect(listConnections()).toHaveLength(1);

    removeConnection("yunxiao");
    expect(getConnection("yunxiao")).toBeNull();
  });
});

describe("Workspace integration store", () => {
  it("creates an empty config with all stages", () => {
    expect(createEmptyWorkspaceIntegrationConfig()).toEqual({
      "project-management": [],
      "source-control": [],
      "ci-cd": [],
      deployment: [],
      communication: [],
      observability: [],
    });
  });

  it("round-trips Workspace integration config", () => {
    saveWorkspaceIntegrationConfig("project-1", {
      ...createEmptyWorkspaceIntegrationConfig(),
      "project-management": [
        {
          providerId: "yunxiao",
          resourceType: "projex-project",
          resourceId: "proj-1",
        },
      ],
    });

    expect(loadWorkspaceIntegrationConfig("project-1")["project-management"]).toEqual([
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        resourceId: "proj-1",
      },
    ]);
  });

  it("updates a single stage without affecting other stages", () => {
    saveWorkspaceIntegrationConfig("project-2", {
      ...createEmptyWorkspaceIntegrationConfig(),
      "project-management": [
        {
          providerId: "yunxiao",
          resourceType: "projex-project",
          resourceId: "proj-1",
        },
      ],
    });

    const next = setStageResources("project-2", "source-control", [
      {
        providerId: "yunxiao",
        resourceType: "codeup-repo",
        resourceId: "repo-1",
      },
    ]);

    expect(next["project-management"]).toHaveLength(1);
    expect(next["source-control"]).toEqual([
      {
        providerId: "yunxiao",
        resourceType: "codeup-repo",
        resourceId: "repo-1",
      },
    ]);
  });

  it("stores integration under the Workspace directory", () => {
    expect(workspaceIntegrationPath("project-3")).toBe(
      `${tempRoot}/workspaces/project-3/integrations/config.json`
    );
  });

  it("persists Folder binding but omits current/stale read projections", () => {
    saveWorkspaceIntegrationConfig("workspace-a", {
      ...createEmptyWorkspaceIntegrationConfig(),
      "source-control": [
        {
          providerId: "yunxiao",
          resourceType: "codeup-repo",
          resourceId: "repo-1",
          folderId: "folder-a",
          currentFolderId: "folder-a",
          staleFolderId: "removed",
        },
      ],
    });

    const raw = JSON.parse(readFileSync(workspaceIntegrationPath("workspace-a"), "utf8")) as {
      "source-control": Array<Record<string, unknown>>;
    };
    expect(raw["source-control"][0]).toEqual({
      providerId: "yunxiao",
      resourceType: "codeup-repo",
      resourceId: "repo-1",
      folderId: "folder-a",
    });
  });
});
