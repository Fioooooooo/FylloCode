import { describe, expect, it } from "vitest";
import { createTurnFileChangeReviewController } from "@renderer/features/turn-file-change-review/application/turn-file-change-review-controller";
import type { TurnFileChange } from "@renderer/features/turn-file-change-review";

function change(path: string): TurnFileChange {
  return {
    path,
    original: `${path}:before`,
    modified: `${path}:after`,
    kind: "modified",
  };
}

describe("turn file change review controller", () => {
  it("uses a valid initial path and exposes its selected change", () => {
    const controller = createTurnFileChangeReviewController(
      [change("/a.ts"), change("/b.ts")],
      "/b.ts"
    );

    expect(controller.selectedPath.value).toBe("/b.ts");
    expect(controller.selectedChange.value?.path).toBe("/b.ts");
  });

  it("falls back to the first file for an invalid initial path", () => {
    const controller = createTurnFileChangeReviewController([change("/a.ts")], "/missing.ts");

    expect(controller.selectedPath.value).toBe("/a.ts");
  });

  it("selects only paths that exist in the current collection", () => {
    const controller = createTurnFileChangeReviewController([change("/a.ts"), change("/b.ts")]);

    controller.select("/b.ts");
    expect(controller.selectedPath.value).toBe("/b.ts");

    controller.select("/missing.ts");
    expect(controller.selectedPath.value).toBe("/b.ts");
  });

  it("preserves the selected path across streaming updates when it remains", () => {
    const controller = createTurnFileChangeReviewController([change("/a.ts"), change("/b.ts")]);
    controller.select("/b.ts");

    const updated = { ...change("/b.ts"), modified: "latest" };
    controller.setChanges([change("/c.ts"), updated]);

    expect(controller.selectedPath.value).toBe("/b.ts");
    expect(controller.selectedChange.value).toEqual(updated);
  });

  it("falls back to the first remaining file when the selection disappears", () => {
    const controller = createTurnFileChangeReviewController([change("/a.ts"), change("/b.ts")]);
    controller.select("/b.ts");

    controller.setChanges([change("/c.ts"), change("/a.ts")]);

    expect(controller.selectedPath.value).toBe("/c.ts");
  });

  it("clears selection for an empty collection and on dispose", () => {
    const controller = createTurnFileChangeReviewController([change("/a.ts")]);

    controller.setChanges([]);
    expect(controller.changes.value).toEqual([]);
    expect(controller.selectedPath.value).toBeNull();
    expect(controller.selectedChange.value).toBeNull();

    controller.setChanges([change("/b.ts")]);
    controller.dispose();
    expect(controller.changes.value).toEqual([]);
    expect(controller.selectedPath.value).toBeNull();
  });

  it("copies the collection instead of retaining the caller array", () => {
    const source = [change("/a.ts")];
    const controller = createTurnFileChangeReviewController(source);

    source.push(change("/b.ts"));

    expect(controller.changes.value.map((item) => item.path)).toEqual(["/a.ts"]);
  });
});
