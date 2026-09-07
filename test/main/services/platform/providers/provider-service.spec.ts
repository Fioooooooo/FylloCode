import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCredentials: vi.fn(),
  saveCredentials: vi.fn(),
  clearCredentials: vi.fn(),
  saveConnection: vi.fn(),
  getConnection: vi.fn(),
  listConnections: vi.fn(),
  removeConnection: vi.fn(),
  getYunxiaoUser: vi.fn(),
  listOrganizations: vi.fn(),
  listProviderResources: vi.fn(),
}));

vi.mock("@main/infra/storage/provider-credential-store", () => ({
  loadCredentials: mocks.loadCredentials,
  saveCredentials: mocks.saveCredentials,
  clearCredentials: mocks.clearCredentials,
}));

vi.mock("@main/infra/storage/provider-connection-store", () => ({
  getConnection: mocks.getConnection,
  listConnections: mocks.listConnections,
  removeConnection: mocks.removeConnection,
  saveConnection: mocks.saveConnection,
}));

vi.mock("@main/infra/integration/yunxiao/organization", () => ({
  getUser: mocks.getYunxiaoUser,
  listOrganizations: mocks.listOrganizations,
}));

vi.mock("@main/infra/integration/yunxiao/client", () => ({
  YunxiaoApiError: class YunxiaoApiError extends Error {
    readonly status = 500;
  },
}));

vi.mock("@main/services/platform/providers/provider-resource-service", () => ({
  listProviderResources: mocks.listProviderResources,
}));

import {
  connectProvider,
  disconnectProvider,
} from "@main/services/platform/providers/provider-service";

describe("provider-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCredentials.mockReturnValue({
      "x-yunxiao-token": "old-token",
      organizationId: "org-old",
    });
    mocks.saveConnection.mockImplementation((connection: unknown) => connection);
    mocks.getYunxiaoUser.mockResolvedValue({
      id: "user-1",
      email: "demo@example.com",
      username: "demo",
      name: "Demo",
      lastOrganization: "org-new",
    });
    mocks.listOrganizations.mockResolvedValue([{ id: "org-new", name: "New Org" }]);
  });

  it("preserves stored provider context when reconnecting with a new credential", async () => {
    await expect(
      connectProvider("yunxiao", { "x-yunxiao-token": "new-token" })
    ).resolves.toMatchObject({
      providerId: "yunxiao",
      state: "connected",
    });

    expect(mocks.saveCredentials).toHaveBeenNthCalledWith(1, "yunxiao", {
      "x-yunxiao-token": "new-token",
    });
    expect(mocks.saveCredentials).toHaveBeenNthCalledWith(2, "yunxiao", {
      "x-yunxiao-token": "new-token",
      organizationId: "org-old",
      userId: "user-1",
    });
  });

  it("clears credentials when provider verification fails", async () => {
    mocks.listOrganizations.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(connectProvider("yunxiao", { "x-yunxiao-token": "new-token" })).rejects.toThrow(
      "provider unavailable"
    );
    expect(mocks.clearCredentials).toHaveBeenCalledWith("yunxiao");
  });

  it("clears provider credentials through the existing service boundary", () => {
    disconnectProvider("yunxiao");

    expect(mocks.clearCredentials).toHaveBeenCalledWith("yunxiao");
    expect(mocks.removeConnection).toHaveBeenCalledWith("yunxiao");
  });
});
