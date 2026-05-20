import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "fs";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@main/__tests__/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-provider-stores-"),
  };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

import {
  clearCredentials,
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
  createEmptyProjectIntegrationConfig,
  loadProjectIntegrationConfig,
  projectIntegrationPath,
  saveProjectIntegrationConfig,
  setStageResources,
} from "@main/infra/storage/project-integration-store";

beforeEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("provider credential store", () => {
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

describe("project integration store", () => {
  it("creates an empty config with all stages", () => {
    expect(createEmptyProjectIntegrationConfig()).toEqual({
      "project-management": [],
      "source-control": [],
      "ci-cd": [],
      deployment: [],
      communication: [],
      observability: [],
    });
  });

  it("round-trips project integration config", () => {
    saveProjectIntegrationConfig("project-1", {
      ...createEmptyProjectIntegrationConfig(),
      "project-management": [
        {
          providerId: "yunxiao",
          resourceType: "projex-project",
          resourceId: "proj-1",
        },
      ],
    });

    expect(loadProjectIntegrationConfig("project-1")["project-management"]).toEqual([
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        resourceId: "proj-1",
      },
    ]);
  });

  it("updates a single stage without affecting other stages", () => {
    saveProjectIntegrationConfig("project-2", {
      ...createEmptyProjectIntegrationConfig(),
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

  it("stores project integration under the project directory", () => {
    expect(projectIntegrationPath("project-3")).toBe(
      `${tempRoot}/projects/project-3/integrations/config.json`
    );
  });
});
