import { describe, expect, it, vi } from "vitest";
import { useDefaultAppRoute } from "@renderer/composables/useDefaultAppRoute";
import { defaultActivityBarItem } from "@renderer/config/activity-bar";

const mockPush = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("useDefaultAppRoute", () => {
  it("returns the default path from registry", () => {
    const { defaultPath } = useDefaultAppRoute();
    expect(defaultPath.value).toBe(defaultActivityBarItem.path);
  });

  it("goToDefault pushes the default path", async () => {
    mockPush.mockClear();
    const { goToDefault } = useDefaultAppRoute();
    await goToDefault();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(defaultActivityBarItem.path);
  });
});
