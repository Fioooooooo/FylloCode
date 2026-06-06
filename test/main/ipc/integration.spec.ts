import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { rmSync } from "fs";
import { IntegrationChannels } from "@shared/types/channels";
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

vi.mock("@main/domain/integration/yunxiao/organization", () => ({
  getUser: mocks.getYunxiaoUser,
  listOrganizations: mocks.listOrganizations,
}));

vi.mock("@main/domain/integration/yunxiao/projex", () => ({
  searchProjects: mocks.searchProjects,
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

    const { registerIntegrationHandlers } = await import("@main/ipc/integration");
    registerIntegrationHandlers();
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
    const invoke = handler(IntegrationChannels.providersListResources);

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
    const listHandler = handler(IntegrationChannels.providersList);
    const connectHandler = handler(IntegrationChannels.providersConnect);
    const probeHandler = handler(IntegrationChannels.providersProbe);
    const disconnectHandler = handler(IntegrationChannels.providersDisconnect);
    const legacyDisconnectHandler = handler(IntegrationChannels.disconnect);
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

  it("persists project integration per project without cross-project bleed", async () => {
    const setHandler = handler(IntegrationChannels.projectSet);
    const getHandler = handler(IntegrationChannels.projectGet);

    await setHandler(
      {},
      {
        projectId: "project-a",
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
        projectId: "project-b",
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

    const projectA = await getHandler({}, { projectId: "project-a" });
    const projectB = await getHandler({}, { projectId: "project-b" });

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

  it("rejects invalid project integration tuples", async () => {
    const setHandler = handler(IntegrationChannels.projectSet);

    const result = await setHandler(
      {},
      {
        projectId: "project-a",
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
});
