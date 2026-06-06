import { describe, expect, it } from "vitest";
import { parseArchiveOutcome } from "../../../src/mcp-servers/fyllo-specs/src/runtime-openspec/parse-archive-outcome";

describe("parseArchiveOutcome", () => {
  it("returns success on the exact archive marker", () => {
    const stdout = "Change 'my-change' archived as '2026-05-22-my-change'.\n";
    expect(parseArchiveOutcome(stdout, "my-change")).toEqual({ kind: "success" });
  });

  it("returns success even with preceding spec-update noise", () => {
    const stdout = [
      "Specs to update:",
      "  foo: update",
      "Totals: + 1, ~ 0, - 0, → 0",
      "Specs updated successfully.",
      "Change 'my-change' archived as '2026-05-22-my-change'.",
      "",
    ].join("\n");
    expect(parseArchiveOutcome(stdout, "my-change")).toEqual({ kind: "success" });
  });

  it("returns unknown when only a different change matches the marker", () => {
    const stdout = "Change 'other-change' archived as '2026-05-22-other-change'.";
    expect(parseArchiveOutcome(stdout, "my-change")).toEqual({ kind: "unknown" });
  });

  it("identifies the validation-failed signal", () => {
    const stdout = [
      "Validation errors in change delta specs:",
      "  ✗ missing scenario",
      "Validation failed. Please fix the errors before archiving.",
      "To skip validation (not recommended), use --no-validate flag.",
      "",
    ].join("\n");
    expect(parseArchiveOutcome(stdout, "my-change")).toEqual({
      kind: "known-failure",
      signal: "validation-failed",
    });
  });

  it("identifies the spec-update-aborted signal", () => {
    const stdout = "build error message\nAborted. No files were changed.\n";
    expect(parseArchiveOutcome(stdout, "my-change")).toEqual({
      kind: "known-failure",
      signal: "spec-update-aborted",
    });
  });

  it("identifies the no-change-selected signal", () => {
    const stdout = "No change selected. Aborting.\n";
    expect(parseArchiveOutcome(stdout, "my-change")).toEqual({
      kind: "known-failure",
      signal: "no-change-selected",
    });
  });

  it("identifies the archive-cancelled signal", () => {
    const stdout = "Archive cancelled.\n";
    expect(parseArchiveOutcome(stdout, "my-change")).toEqual({
      kind: "known-failure",
      signal: "archive-cancelled",
    });
  });

  it("returns unknown for empty stdout", () => {
    expect(parseArchiveOutcome("", "my-change")).toEqual({ kind: "unknown" });
  });

  it("returns unknown for unrelated stdout", () => {
    expect(parseArchiveOutcome("some unrelated text\n", "my-change")).toEqual({ kind: "unknown" });
  });

  it("escapes regex meta characters in changeName", () => {
    const stdout = "Change 'feat.v2+a' archived as '2026-05-22-feat.v2+a'.";
    expect(parseArchiveOutcome(stdout, "feat.v2+a")).toEqual({ kind: "success" });
  });

  it("prefers known-failure when both success marker and abort message appear", () => {
    const stdout = [
      "Change 'my-change' archived as '2026-05-22-my-change'.",
      "Aborted. No files were changed.",
      "",
    ].join("\n");
    expect(parseArchiveOutcome(stdout, "my-change")).toEqual({
      kind: "known-failure",
      signal: "spec-update-aborted",
    });
  });
});
