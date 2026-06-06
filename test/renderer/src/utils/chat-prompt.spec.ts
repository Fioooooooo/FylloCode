import { describe, expect, it } from "vitest";
import { applyCommandSelection, isCursorAtLineStart } from "@renderer/utils/chat-prompt";

describe("chat-prompt utils", () => {
  it("detects whether the cursor is at the start of a line", () => {
    expect(isCursorAtLineStart("", 0)).toBe(true);
    expect(isCursorAtLineStart("hello", 0)).toBe(true);
    expect(isCursorAtLineStart("hello", 5)).toBe(false);
    expect(isCursorAtLineStart("hello\n", 6)).toBe(true);
    expect(isCursorAtLineStart("hello\n  ", 8)).toBe(true);
  });

  it("inserts a command from the slash trigger by replacing the typed slash", () => {
    expect(
      applyCommandSelection({
        currentValue: "/",
        selectionStart: 1,
        selectionEnd: 1,
        commandName: "review",
        triggerSource: "slash",
      })
    ).toEqual({
      value: "/review ",
      cursor: 8,
    });

    expect(
      applyCommandSelection({
        currentValue: "hello\n/",
        selectionStart: 7,
        selectionEnd: 7,
        commandName: "plan",
        triggerSource: "slash",
      })
    ).toEqual({
      value: "hello\n/plan ",
      cursor: 12,
    });
  });

  it("inserts a command from the button with the correct spacing", () => {
    expect(
      applyCommandSelection({
        currentValue: "fix this",
        selectionStart: 8,
        selectionEnd: 8,
        commandName: "review",
        triggerSource: "button",
      })
    ).toEqual({
      value: "fix this /review ",
      cursor: 17,
    });

    expect(
      applyCommandSelection({
        currentValue: "fix this ",
        selectionStart: 9,
        selectionEnd: 9,
        commandName: "review",
        triggerSource: "button",
      })
    ).toEqual({
      value: "fix this /review ",
      cursor: 17,
    });
  });
});
