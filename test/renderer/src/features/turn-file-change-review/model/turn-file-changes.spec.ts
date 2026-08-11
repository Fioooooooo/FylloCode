import { describe, expect, it } from "vitest";
import type { ToolCallDiff } from "@shared/types/stream-event";
import {
  projectTurnFileChanges,
  selectToolTurnFileChanges,
} from "@renderer/features/turn-file-change-review";

describe("turn file changes", () => {
  it("merges the same path across tools using the first old text and final new text", () => {
    expect(
      projectTurnFileChanges([
        [{ path: "/app.ts", oldText: "before", newText: "middle" }],
        [{ path: "/app.ts", oldText: "middle", newText: "after" }],
      ])
    ).toEqual([{ path: "/app.ts", original: "before", modified: "after", kind: "modified" }]);
  });

  it("keeps a created file classified as added after later modifications", () => {
    expect(
      projectTurnFileChanges([
        [{ path: "/new.ts", newText: "first" }],
        [{ path: "/new.ts", oldText: "first", newText: "final" }],
      ])
    ).toEqual([{ path: "/new.ts", original: "", modified: "final", kind: "added" }]);
  });

  it("classifies a modified file whose final content is empty as deleted", () => {
    expect(
      projectTurnFileChanges([
        [{ path: "/gone.ts", oldText: "before", newText: "middle" }],
        [{ path: "/gone.ts", oldText: "middle", newText: "" }],
      ])
    ).toEqual([{ path: "/gone.ts", original: "before", modified: "", kind: "deleted" }]);
  });

  it("removes files created then deleted and files restored to their original content", () => {
    expect(
      projectTurnFileChanges([
        [
          { path: "/temporary.ts", newText: "temporary" },
          { path: "/restored.ts", oldText: "original", newText: "changed" },
        ],
        [
          { path: "/temporary.ts", oldText: "temporary", newText: "" },
          { path: "/restored.ts", oldText: "changed", newText: "original" },
        ],
      ])
    ).toEqual([]);
  });

  it("deduplicates paths and preserves their first appearance order", () => {
    expect(
      projectTurnFileChanges([
        [
          { path: "/b.ts", oldText: "b0", newText: "b1" },
          { path: "/a.ts", oldText: "a0", newText: "a1" },
          { path: "/b.ts", oldText: "b1", newText: "b2" },
        ],
      ])
    ).toEqual([
      { path: "/b.ts", original: "b0", modified: "b2", kind: "modified" },
      { path: "/a.ts", original: "a0", modified: "a1", kind: "modified" },
    ]);
  });

  it("selects only net turn changes belonging to one tool in tool path order", () => {
    const turnChanges = projectTurnFileChanges([
      [
        { path: "/a.ts", oldText: "a0", newText: "a1" },
        { path: "/b.ts", oldText: "b0", newText: "b1" },
      ],
      [{ path: "/a.ts", oldText: "a1", newText: "a0" }],
    ]);

    expect(
      selectToolTurnFileChanges(
        [
          { path: "/b.ts", oldText: "b0", newText: "b1" },
          { path: "/b.ts", oldText: "b0", newText: "b1" },
          { path: "/a.ts", oldText: "a1", newText: "a0" },
        ],
        turnChanges
      )
    ).toEqual([{ path: "/b.ts", original: "b0", modified: "b1", kind: "modified" }]);
  });

  it("does not mutate input diff arrays or entries", () => {
    const first: ToolCallDiff = Object.freeze({
      path: "/app.ts",
      oldText: "before",
      newText: "middle",
    });
    const second: ToolCallDiff = Object.freeze({
      path: "/app.ts",
      oldText: "middle",
      newText: "after",
    });
    const toolDiffs = Object.freeze([Object.freeze([first]), Object.freeze([second])]);

    projectTurnFileChanges(toolDiffs);

    expect(toolDiffs).toEqual([[first], [second]]);
    expect(first).toEqual({ path: "/app.ts", oldText: "before", newText: "middle" });
    expect(second).toEqual({ path: "/app.ts", oldText: "middle", newText: "after" });
  });
});
