import { beforeEach, describe, expect, it, vi } from "vitest";

const getBrowserMock = vi.fn();
const readEntryMock = vi.fn();
const saveEntryMock = vi.fn();
const deleteEntryMock = vi.fn();

describe("renderer knowledgeApi", () => {
  beforeEach(() => {
    getBrowserMock.mockReset();
    readEntryMock.mockReset();
    saveEntryMock.mockReset();
    deleteEntryMock.mockReset();
    getBrowserMock.mockResolvedValue({ ok: true, data: { entries: [], errors: [] } });
    readEntryMock.mockResolvedValue({
      ok: true,
      data: { name: "markstream-vue-theme-subscription", content: "---\nname: test\n---\n" },
    });
    saveEntryMock.mockResolvedValue({
      ok: true,
      data: { name: "markstream-vue-theme-subscription", content: "---\nname: test\n---\n" },
    });
    deleteEntryMock.mockResolvedValue({
      ok: true,
      data: { name: "markstream-vue-theme-subscription" },
    });
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        insight: {
          knowledge: {
            getBrowser: getBrowserMock,
            readEntry: readEntryMock,
            saveEntry: saveEntryMock,
            deleteEntry: deleteEntryMock,
          },
        },
      },
    });
  });

  it("delegates getBrowser to the preload insight knowledge API", async () => {
    const { knowledgeApi } = await import("@renderer/api/insight/knowledge");

    await knowledgeApi.getBrowser("project-1");

    expect(getBrowserMock).toHaveBeenCalledWith("project-1");
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

  it("delegates deleteEntry to the preload insight knowledge API", async () => {
    const { knowledgeApi } = await import("@renderer/api/insight/knowledge");

    await knowledgeApi.deleteEntry("project-1", {
      name: "markstream-vue-theme-subscription",
    });

    expect(deleteEntryMock).toHaveBeenCalledWith("project-1", {
      name: "markstream-vue-theme-subscription",
    });
  });
});
