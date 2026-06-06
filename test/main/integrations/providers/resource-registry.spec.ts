import { beforeEach, describe, expect, it, vi } from "vitest";
import { YunxiaoApiError } from "@main/domain/integration/yunxiao/client";
import type { ProviderConnection } from "@shared/types/integration";

const mocks = vi.hoisted(() => ({
  loadCredentials: vi.fn(),
  saveConnection: vi.fn(),
  searchProjects: vi.fn(),
  listRepositories: vi.fn(),
  listPipelines: vi.fn(),
}));

vi.mock("@main/infra/storage/provider-credential-store", () => ({
  loadCredentials: mocks.loadCredentials,
}));

vi.mock("@main/infra/storage/provider-connection-store", () => ({
  saveConnection: mocks.saveConnection,
}));

vi.mock("@main/domain/integration/yunxiao/projex", () => ({
  searchProjects: mocks.searchProjects,
}));

vi.mock("@main/domain/integration/yunxiao/codeup", () => ({
  listRepositories: mocks.listRepositories,
}));

vi.mock("@main/domain/integration/yunxiao/flow", () => ({
  listPipelines: mocks.listPipelines,
}));

describe("resource registry", () => {
  const connection: ProviderConnection = {
    providerId: "yunxiao",
    state: "connected",
    accountName: "demo@example.com",
    credentialPreview: { "x-yunxiao-token": "toke****1234" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCredentials.mockReturnValue({
      "x-yunxiao-token": "token-1234",
      organizationId: "org-1",
    });
    mocks.saveConnection.mockImplementation((next) => next);
  });

  it("maps yunxiao projex projects into provider resources", async () => {
    mocks.searchProjects.mockResolvedValue([
      {
        id: "proj-1",
        name: "Project One",
        customCode: "P1",
        description: "Primary project",
        logicalStatus: "NORMAL",
      },
    ]);

    const { listProviderResources } =
      await import("@main/services/integration/provider-resource-service");
    const resources = await listProviderResources({
      providerId: "yunxiao",
      resourceType: "projex-project",
      query: {
        search: "Project",
        page: 2,
        perPage: 20,
        refresh: true,
      },
      connection,
    });

    expect(mocks.searchProjects).toHaveBeenCalledWith({
      organizationId: "org-1",
      search: "Project",
      page: 2,
      perPage: 20,
    });
    expect(resources).toEqual([
      {
        id: "proj-1",
        name: "Project One",
        providerId: "yunxiao",
        resourceType: "projex-project",
        subtitle: "P1",
      },
    ]);
  });

  it("propagates non-auth failures without mutating connection state", async () => {
    mocks.listPipelines.mockRejectedValue(new Error("service unavailable"));

    const { listProviderResources } =
      await import("@main/services/integration/provider-resource-service");

    await expect(
      listProviderResources({
        providerId: "yunxiao",
        resourceType: "flow-pipeline",
        query: {
          search: "build",
          refresh: true,
        },
        connection,
      })
    ).rejects.toThrow("service unavailable");

    expect(mocks.saveConnection).not.toHaveBeenCalled();
  });

  it("marks provider as expired on auth failures", async () => {
    mocks.listRepositories.mockRejectedValue(
      new YunxiaoApiError(401, "ExpiredTokenError", "令牌已过期")
    );

    const { listProviderResources } =
      await import("@main/services/integration/provider-resource-service");

    await expect(
      listProviderResources({
        providerId: "yunxiao",
        resourceType: "codeup-repo",
        query: {
          search: "repo",
          refresh: true,
        },
        connection,
      })
    ).rejects.toMatchObject({
      status: 401,
      code: "ExpiredTokenError",
    });

    expect(mocks.saveConnection).toHaveBeenCalledWith({
      ...connection,
      state: "expired",
    });
  });
});
