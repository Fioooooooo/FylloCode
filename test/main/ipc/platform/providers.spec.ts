import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { rmSync } from "fs";
import { AutomationWorkspaceIntegrationChannels } from "@shared/ipc/automation/workspace-integration.channels";
import { PlatformProvidersChannels } from "@shared/ipc/platform/providers.channels";
import { IpcErrorCodes } from "@shared/constants/error-codes";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");

  return {
    tempRoot: createTestTempRoot("fyllocode-integration-ipc-"),
  };
});

const mocks = vi.hoisted(() => ({
  getYunxiaoUser: vi.fn(),
  listOrganizations: vi.fn(),
  searchProjects: vi.fn(),
}));

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `${tempRoot}/${subPath}`),
}));

vi.mock("@main/infra/integration/yunxiao/organization", () => ({
  getUser: mocks.getYunxiaoUser,
  listOrganizations: mocks.listOrganizations,
}));

vi.mock("@main/infra/integration/yunxiao/projex", () => ({
  searchProjects: mocks.searchProjects,
}));

vi.mock("@main/services/workspace/_public", () => ({
  resolveWorkspace: vi.fn(async (workspaceId: string) => ({
    workspaceId,
    folders: [
      {
        folderId: `${workspaceId}-folder`,
        folderName: workspaceId,
        folderPath: `/repos/${workspaceId}`,
        pathMissing: false,
      },
    ],
  })),
}));

describe("registerIntegrationHandlers", () => {
  beforeEach(async () => {
    rmSync(tempRoot, { recursive: true, force: true });
    vi.clearAllMocks();
    mocks.searchProjects.mockResolvedValue([
      {
        id: "proj-1",
        name: "Project One",
        customCode: "P1",
        description: "Primary project",
        logicalStatus: "NORMAL",
      },
    ]);
    mocks.getYunxiaoUser.mockResolvedValue({
      id: "user-1",
      email: "demo@example.com",
      username: "demo",
      name: "Demo",
      lastOrganization: "org-1",
    });
    mocks.listOrganizations.mockResolvedValue([{ id: "org-1", name: "Org One" }]);

    const { saveConnection } = await import("@main/infra/storage/provider-connection-store");
    const { saveCredentials } = await import("@main/infra/storage/provider-credential-store");
    saveCredentials("yunxiao", {
      "x-yunxiao-token": "token-1234",
      organizationId: "org-1",
    });
    saveConnection({
      providerId: "yunxiao",
      state: "connected",
      accountName: "demo@example.com",
      credentialPreview: { "x-yunxiao-token": "toke****1234" },
    });

    const { registerProviderHandlers } = await import("@main/ipc/platform/providers");
    const { registerWorkspaceIntegrationHandlers } =
      await import("@main/ipc/automation/workspace-integration");
    registerProviderHandlers();
    registerWorkspaceIntegrationHandlers();
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function handler(channel: string): (event: unknown, input?: unknown) => Promise<unknown> {
    const call = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, input?: unknown) => Promise<unknown>;
  }

  it("reuses cached listResources results until refresh is requested", async () => {
    const invoke = handler(PlatformProvidersChannels.listResources);

    const first = await invoke(
      {},
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        query: { search: "demo" },
      }
    );
    const second = await invoke(
      {},
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        query: { search: "demo" },
      }
    );
    const refreshed = await invoke(
      {},
      {
        providerId: "yunxiao",
        resourceType: "projex-project",
        query: { search: "demo", refresh: true },
      }
    );

    expect(first).toEqual({ ok: true, data: expect.any(Array) });
    expect(second).toEqual({ ok: true, data: expect.any(Array) });
    expect(refreshed).toEqual({ ok: true, data: expect.any(Array) });
    expect(mocks.searchProjects).toHaveBeenCalledTimes(2);
  });

  it("lists, connects, probes, and disconnects providers through IPC", async () => {
    const listHandler = handler(PlatformProvidersChannels.list);
    const connectHandler = handler(PlatformProvidersChannels.connectProvider);
    const probeHandler = handler(PlatformProvidersChannels.probe);
    const disconnectHandler = handler(PlatformProvidersChannels.disconnectProvider);
    const legacyDisconnectHandler = handler(PlatformProvidersChannels.disconnect);
    const { loadCredentials } = await import("@main/infra/storage/provider-credential-store");
    const { getConnection } = await import("@main/infra/storage/provider-connection-store");
    const { getYunxiaoOrganizationId, getYunxiaoToken, getYunxiaoUserId } =
      await import("@main/infra/storage/yunxiao-credentials");

    const initialList = await listHandler({}, undefined);
    expect(initialList).toEqual({
      ok: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          id: "yunxiao",
          connection: expect.objectContaining({
            providerId: "yunxiao",
            state: "connected",
          }),
        }),
      ]),
    });

    await disconnectHandler({}, { providerId: "yunxiao" });
    const disconnectedList = await listHandler({}, undefined);
    expect(disconnectedList).toEqual({
      ok: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          id: "yunxiao",
          connection: null,
        }),
      ]),
    });

    const connectResult = await connectHandler(
      {},
      {
        providerId: "yunxiao",
        credentials: { "x-yunxiao-token": "token-new" },
      }
    );
    expect(connectResult).toEqual({
      ok: true,
      data: expect.objectContaining({
        providerId: "yunxiao",
        state: "connected",
        accountId: "user-1",
        accountName: "demo@example.com",
      }),
    });
    expect(loadCredentials("yunxiao")).toEqual(
      expect.objectContaining({
        "x-yunxiao-token": "token-new",
        userId: "user-1",
        organizationId: "org-1",
      })
    );
    expect(getConnection("yunxiao")).toEqual(
      expect.objectContaining({
        providerId: "yunxiao",
        accountId: "user-1",
      })
    );

    const probeResult = await probeHandler({}, { providerId: "yunxiao" });
    expect(probeResult).toEqual({
      ok: true,
      data: expect.objectContaining({
        providerId: "yunxiao",
        state: "connected",
        accountId: "user-1",
      }),
    });
    expect(mocks.getYunxiaoUser).toHaveBeenCalled();

    await legacyDisconnectHandler({}, { toolId: "yunxiao-projex" });
    expect(getYunxiaoToken()).toBe("");
    expect(getYunxiaoUserId()).toBe("");
    expect(getYunxiaoOrganizationId()).toBe("");
    expect(loadCredentials("yunxiao")).toEqual({});
    expect(getConnection("yunxiao")).toBeNull();
  });

  it("persists Workspace integration without cross-Workspace bleed", async () => {
    const setHandler = handler(AutomationWorkspaceIntegrationChannels.set);
    const getHandler = handler(AutomationWorkspaceIntegrationChannels.get);

    await setHandler(
      {},
      {
        workspaceId: "project-a",
        stage: "project-management",
        resources: [
          {
            providerId: "yunxiao",
            resourceType: "projex-project",
            resourceId: "proj-a",
          },
        ],
      }
    );

    await setHandler(
      {},
      {
        workspaceId: "project-b",
        stage: "project-management",
        resources: [
          {
            providerId: "yunxiao",
            resourceType: "projex-project",
            resourceId: "proj-b",
          },
        ],
      }
    );

    const projectA = await getHandler({}, { workspaceId: "project-a" });
    const projectB = await getHandler({}, { workspaceId: "project-b" });

    expect(projectA).toEqual({
      ok: true,
      data: expect.objectContaining({
        "project-management": [
          {
            providerId: "yunxiao",
            resourceType: "projex-project",
            resourceId: "proj-a",
          },
        ],
      }),
    });
    expect(projectB).toEqual({
      ok: true,
      data: expect.objectContaining({
        "project-management": [
          {
            providerId: "yunxiao",
            resourceType: "projex-project",
            resourceId: "proj-b",
          },
        ],
      }),
    });
  });

  it("rejects invalid Workspace integration tuples", async () => {
    const setHandler = handler(AutomationWorkspaceIntegrationChannels.set);

    const result = await setHandler(
      {},
      {
        workspaceId: "project-a",
        stage: "communication",
        resources: [
          {
            providerId: "yunxiao",
            resourceType: "projex-project",
            resourceId: "proj-a",
          },
        ],
      }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: IpcErrorCodes.INTEGRATION_RESOURCE_TYPE_NOT_SUPPORTED,
      }),
    });
  });

  it("requires current Folder binding for repository-bound stages", async () => {
    const setHandler = handler(AutomationWorkspaceIntegrationChannels.set);
    const missingBinding = await setHandler(
      {},
      {
        workspaceId: "project-a",
        stage: "source-control",
        resources: [{ providerId: "yunxiao", resourceType: "codeup-repo", resourceId: "repo-a" }],
      }
    );
    const staleBinding = await setHandler(
      {},
      {
        workspaceId: "project-a",
        stage: "source-control",
        resources: [
          {
            providerId: "yunxiao",
            resourceType: "codeup-repo",
            resourceId: "repo-a",
            folderId: "removed",
          },
        ],
      }
    );
    const currentBinding = await setHandler(
      {},
      {
        workspaceId: "project-a",
        stage: "source-control",
        resources: [
          {
            providerId: "yunxiao",
            resourceType: "codeup-repo",
            resourceId: "repo-a",
            folderId: "project-a-folder",
          },
        ],
      }
    );

    expect(missingBinding).toEqual({
      ok: false,
      error: expect.objectContaining({ code: IpcErrorCodes.VALIDATION_ERROR }),
    });
    expect(staleBinding).toEqual({
      ok: false,
      error: expect.objectContaining({ code: IpcErrorCodes.VALIDATION_ERROR }),
    });
    expect(currentBinding).toEqual({
      ok: true,
      data: expect.objectContaining({
        "source-control": [
          expect.objectContaining({
            folderId: "project-a-folder",
            currentFolderId: "project-a-folder",
          }),
        ],
      }),
    });
  });

  it("keeps Workspace-level resources unbound", async () => {
    const result = await handler(AutomationWorkspaceIntegrationChannels.set)(
      {},
      {
        workspaceId: "project-a",
        stage: "project-management",
        resources: [
          {
            providerId: "yunxiao",
            resourceType: "projex-project",
            resourceId: "proj-a",
            folderId: "project-a-folder",
          },
        ],
      }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: IpcErrorCodes.VALIDATION_ERROR }),
    });
  });

  it("preserves legacy unbound and removed-member entries in read projection", async () => {
    const { saveWorkspaceIntegrationConfig } =
      await import("@main/infra/storage/workspace-integration-store");
    saveWorkspaceIntegrationConfig("project-a", {
      "project-management": [],
      "source-control": [
        {
          providerId: "yunxiao",
          resourceType: "codeup-repo",
          resourceId: "legacy-unbound",
        },
        {
          providerId: "yunxiao",
          resourceType: "codeup-repo",
          resourceId: "stale-bound",
          folderId: "removed",
        },
      ],
      "ci-cd": [],
      deployment: [],
      communication: [],
      observability: [],
    });

    const result = await handler(AutomationWorkspaceIntegrationChannels.get)(
      {},
      { workspaceId: "project-a" }
    );

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        "source-control": [
          expect.not.objectContaining({ folderId: expect.anything() }),
          expect.objectContaining({ folderId: "removed", staleFolderId: "removed" }),
        ],
      }),
    });
  });
});
