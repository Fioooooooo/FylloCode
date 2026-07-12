import { beforeEach, describe, expect, it, vi } from "vitest";

const readEntryMock = vi.fn();
const saveEntryMock = vi.fn();

describe("renderer knowledgeApi", () => {
  beforeEach(() => {
    readEntryMock.mockReset();
    saveEntryMock.mockReset();
    readEntryMock.mockResolvedValue({
      ok: true,
      data: { name: "markstream-vue-theme-subscription", content: "---\nname: test\n---\n" },
    });
    saveEntryMock.mockResolvedValue({
      ok: true,
      data: { name: "markstream-vue-theme-subscription", content: "---\nname: test\n---\n" },
    });
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        insight: {
          knowledge: {
            readEntry: readEntryMock,
            saveEntry: saveEntryMock,
          },
        },
      },
    });
  });

  it("delegates readEntry to the preload insight knowledge API", async () => {
    const { knowledgeApi } = await import("@renderer/api/insight/knowledge");

    await knowledgeApi.readEntry("project-1", {
      name: "markstream-vue-theme-subscription",
    });

    expect(readEntryMock).toHaveBeenCalledWith("project-1", {
      name: "markstream-vue-theme-subscription",
    });
  });

  it("delegates saveEntry to the preload insight knowledge API", async () => {
    const { knowledgeApi } = await import("@renderer/api/insight/knowledge");

    await knowledgeApi.saveEntry("project-1", {
      name: "markstream-vue-theme-subscription",
      content: "---\nname: markstream-vue-theme-subscription\n---\n\nBody",
    });

    expect(saveEntryMock).toHaveBeenCalledWith("project-1", {
      name: "markstream-vue-theme-subscription",
      content: "---\nname: markstream-vue-theme-subscription\n---\n\nBody",
    });
  });
});
