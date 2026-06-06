import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskItem } from "@shared/types/task";

const mocks = vi.hoisted(() => ({
  localList: vi.fn(),
  localGet: vi.fn(),
  yunxiaoList: vi.fn(),
  yunxiaoGet: vi.fn(),
  githubList: vi.fn(),
  githubGet: vi.fn(),
}));

vi.mock("@main/services/task/adapters/local-task-adapter", () => ({
  localTaskAdapter: {
    list: mocks.localList,
    get: mocks.localGet,
  },
}));

vi.mock("@main/services/task/adapters/yunxiao-task-adapter", () => ({
  yunxiaoTaskAdapter: {
    list: mocks.yunxiaoList,
    get: mocks.yunxiaoGet,
  },
}));

vi.mock("@main/services/task/adapters/github-task-adapter", () => ({
  githubTaskAdapter: {
    list: mocks.githubList,
    get: mocks.githubGet,
  },
}));

import { getTask, listTasks } from "@main/services/task/task-aggregator";

function buildTask(id: string, source: TaskItem["source"], updatedAt: string): TaskItem {
  return {
    id,
    projectId: "project-1",
    title: id,
    description: { format: "plain_text", content: "" },
    status: "open",
    source,
    sourceMeta:
      source === "local"
        ? { source: "local" }
        : source === "yunxiao"
          ? { source: "yunxiao", key: id, issueType: "任务" }
          : { source: "github", repository: "repo/test", number: 1 },
    labels: [],
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
  };
}

describe("task-aggregator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.localList.mockResolvedValue([]);
    mocks.localGet.mockResolvedValue(null);
    mocks.yunxiaoList.mockResolvedValue([]);
    mocks.yunxiaoGet.mockResolvedValue(null);
    mocks.githubList.mockResolvedValue([]);
    mocks.githubGet.mockResolvedValue(null);
  });

  it("returns the real yunxiao adapter result when source is yunxiao", async () => {
    const yunxiaoTask = buildTask("yx-1", "yunxiao", "2026-05-10T10:00:00.000Z");
    mocks.yunxiaoList.mockResolvedValue([yunxiaoTask]);

    await expect(listTasks("project-1", "yunxiao")).resolves.toEqual([yunxiaoTask]);
    expect(mocks.yunxiaoList).toHaveBeenCalledWith("project-1");
    expect(mocks.localList).not.toHaveBeenCalled();
    expect(mocks.githubList).not.toHaveBeenCalled();
  });

  it("sorts aggregated results by updatedAt descending when no source is specified", async () => {
    const localTask = buildTask("local-1", "local", "2026-05-10T08:00:00.000Z");
    const yunxiaoTask = buildTask("yx-1", "yunxiao", "2026-05-10T10:00:00.000Z");
    mocks.localList.mockResolvedValue([localTask]);
    mocks.yunxiaoList.mockResolvedValue([yunxiaoTask]);

    await expect(listTasks("project-1")).resolves.toEqual([yunxiaoTask, localTask]);
  });

  it("dispatches getTask to yunxiao adapter when taskId starts with yunxiao", async () => {
    const yunxiaoTask = buildTask("yunxiao:space-1:102", "yunxiao", "2026-05-10T10:00:00.000Z");
    mocks.yunxiaoGet.mockResolvedValue(yunxiaoTask);

    await expect(getTask("project-1", "yunxiao:space-1:102")).resolves.toEqual(yunxiaoTask);
    expect(mocks.yunxiaoGet).toHaveBeenCalledWith("yunxiao:space-1:102", "project-1");
    expect(mocks.localGet).not.toHaveBeenCalled();
  });

  it("dispatches getTask to local adapter for non-namespaced local ids", async () => {
    const localTask = buildTask("task-1", "local", "2026-05-10T08:00:00.000Z");
    mocks.localGet.mockResolvedValue(localTask);

    await expect(getTask("project-1", "task-1")).resolves.toEqual(localTask);
    expect(mocks.localGet).toHaveBeenCalledWith("task-1", "project-1");
    expect(mocks.yunxiaoGet).not.toHaveBeenCalled();
  });
});
