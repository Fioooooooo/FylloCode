import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPreferences from "@renderer/components/settings/SettingsPreferences.vue";
import { useSettingsStore } from "@renderer/stores/settings";

const confirmDialogMock = vi.fn<(options: Record<string, unknown>) => Promise<boolean>>();

vi.mock("@renderer/composables/useConfirmDialog", () => ({
  useConfirmDialog: () => confirmDialogMock,
}));

describe("SettingsPreferences", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    confirmDialogMock.mockReset();
  });

  it("confirms before clearing all history", async () => {
    confirmDialogMock.mockResolvedValue(true);
    const store = useSettingsStore();
    const clearAllHistory = vi.spyOn(store, "clearAllHistory").mockResolvedValue();

    const wrapper = mount(SettingsPreferences);

    const clearButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("清除历史"));
    expect(clearButton).toBeTruthy();
    await clearButton!.trigger("click");
    await nextTick();

    expect(confirmDialogMock).toHaveBeenCalledWith({
      title: "清除所有历史？",
      description: "这将永久删除所有会话历史、Token 用量统计及相关数据，此操作不可撤销。",
      confirmLabel: "清除所有历史",
      confirmColor: "error",
    });
    expect(clearAllHistory).toHaveBeenCalledTimes(1);
  });

  it("does not clear history when confirmation is cancelled", async () => {
    confirmDialogMock.mockResolvedValue(false);
    const store = useSettingsStore();
    const clearAllHistory = vi.spyOn(store, "clearAllHistory").mockResolvedValue();

    const wrapper = mount(SettingsPreferences);

    const clearButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("清除历史"));
    expect(clearButton).toBeTruthy();
    await clearButton!.trigger("click");
    await nextTick();

    expect(clearAllHistory).not.toHaveBeenCalled();
  });
});
