import { describe, expect, it } from "vitest";
import { routes } from "vue-router/auto-routes";

describe("settings route records", () => {
  it("redirects the stable settings entry to the ACP Agents child route", () => {
    const settingsRoute = routes.find((route) => route.path === "/settings");

    expect(settingsRoute?.redirect).toBe("/settings/acp-agents");
    const childPaths = settingsRoute?.children?.map((route) => route.path);
    expect(childPaths).toHaveLength(4);
    expect(childPaths).toEqual(
      expect.arrayContaining(["acp-agents", "about", "connections", "preferences"])
    );
  });
});
