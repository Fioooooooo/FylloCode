import { beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import {
  countTasks,
  parseWhySummary,
  parseYamlCreated,
  parseYamlStatus,
  resolveApplyRunChangeId,
  stripArchivePrefix,
  toTitleCase,
} from "@main/domain/proposal/openspec-reader";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
});

describe("openspec-reader pure helpers", () => {
  it("stripArchivePrefix removes leading YYYY-MM-DD- only", () => {
    expect(stripArchivePrefix("2026-04-23-foo-bar")).toBe("foo-bar");
    expect(stripArchivePrefix("no-prefix-change")).toBe("no-prefix-change");
  });

  it("toTitleCase splits on dashes and underscores", () => {
    expect(toTitleCase("refactor-main-layering")).toBe("Refactor Main Layering");
    expect(toTitleCase("my_cool_feature")).toBe("My Cool Feature");
    expect(toTitleCase("")).toBe("");
  });

  it("parseYamlStatus recognises known values and falls back to draft", () => {
    expect(parseYamlStatus("status: draft\n")).toBe("draft");
    expect(parseYamlStatus("status: applying\n")).toBe("applying");
    expect(parseYamlStatus("status: archived\n")).toBe("archived");
    expect(parseYamlStatus("foo: bar\n")).toBe("draft");
    expect(parseYamlStatus("status: unknown\n")).toBe("draft");
  });

  it("parseYamlCreated reads the `created:` field when present", () => {
    expect(parseYamlCreated("created: 2026-05-07\n")).toBe("2026-05-07");
    expect(parseYamlCreated("status: draft\n")).toBe("");
  });

  it("parseWhySummary returns first paragraph under ## Why, ignoring bullets", () => {
    const content = [
      "## Proposal",
      "",
      "## Why",
      "",
      "We need a better way.",
      "",
      "- irrelevant bullet",
      "",
      "Second paragraph.",
      "",
      "## What",
      "",
      "ignored",
    ].join("\n");
    expect(parseWhySummary(content)).toBe("We need a better way.");
  });

  it("parseWhySummary truncates very long summaries", () => {
    const long = "x".repeat(400);
    const content = `## Why\n\n${long}\n`;
    const summary = parseWhySummary(content);
    expect(summary.endsWith("...")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(303);
  });

  it("countTasks counts done vs total", () => {
    const content = ["- [x] done 1", "- [x] done 2", "- [ ] pending 1", "- [ ] pending 2"].join(
      "\n"
    );
    expect(countTasks(content)).toEqual({ totalTasks: 4, doneTasks: 2 });
  });

  it("countTasks handles empty content", () => {
    expect(countTasks("no checkboxes here")).toEqual({ totalTasks: 0, doneTasks: 0 });
  });
});

describe("resolveApplyRunChangeId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps an archived proposal id back to the original change id", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("schema: spec-driven");

    await expect(
      resolveApplyRunChangeId("/tmp/project", "2026-05-07-proposal-archived-run-history")
    ).resolves.toBe("proposal-archived-run-history");

    expect(fs.readFile).toHaveBeenCalledWith(
      "/tmp/project/openspec/changes/archive/2026-05-07-proposal-archived-run-history/.openspec.yaml",
      "utf8"
    );
  });

  it("keeps the current change id for non-archived proposals", async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("missing"));

    await expect(
      resolveApplyRunChangeId("/tmp/project", "proposal-archived-run-history")
    ).resolves.toBe("proposal-archived-run-history");
  });
});
