import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
  getYunxiaoToken: vi.fn(() => "token-1"),
}));

vi.mock("@main/infra/integration/yunxiao/client", () => ({
  YunxiaoClient: class {
    post = mocks.post;
    put = mocks.put;
  },
}));

vi.mock("@main/infra/storage/yunxiao-credentials", () => ({
  getYunxiaoToken: mocks.getYunxiaoToken,
}));

import { createWorkitemComment, updateWorkitem } from "@main/infra/integration/yunxiao/projex";

describe("yunxiao projex write operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getYunxiaoToken.mockReturnValue("token-1");
    mocks.post.mockResolvedValue(undefined);
    mocks.put.mockResolvedValue(undefined);
  });

  it("passes native field values unchanged to updateWorkitem", async () => {
    await updateWorkitem({
      organizationId: "org-1",
      id: "workitem-1",
      fields: { status: "100010" },
    });

    expect(mocks.put).toHaveBeenCalledWith(
      "/oapi/v1/projex/organizations/org-1/workitems/workitem-1",
      "token-1",
      { status: "100010" }
    );
  });

  it("uses the official workitem comments endpoint and content body", async () => {
    await createWorkitemComment({
      organizationId: "org-1",
      id: "workitem-1",
      content: "自动化完成",
    });

    expect(mocks.post).toHaveBeenCalledWith(
      "/oapi/v1/projex/organizations/org-1/workitems/workitem-1/comments",
      "token-1",
      { content: "自动化完成" }
    );
  });
});
