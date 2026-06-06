import { describe, expect, it } from "vitest";
import { activityBarItems, defaultActivityBarItem } from "@renderer/config/activity-bar";

describe("activity-bar registry", () => {
  it("has exactly one default item", () => {
    expect(defaultActivityBarItem).toBeDefined();
    expect(defaultActivityBarItem.isDefault).toBe(true);

    const defaults = activityBarItems.filter((i) => i.isDefault);
    expect(defaults).toHaveLength(1);
  });

  it("has non-empty paths for all items", () => {
    for (const item of activityBarItems) {
      expect(item.path).toBeTruthy();
      expect(item.path.startsWith("/")).toBe(true);
    }
  });

  it("has unique ids", () => {
    const ids = activityBarItems.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique paths", () => {
    const paths = activityBarItems.map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("default item path is /chat", () => {
    expect(defaultActivityBarItem.path).toBe("/chat");
  });
});
