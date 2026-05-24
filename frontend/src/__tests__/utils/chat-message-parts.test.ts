import { describe, expect, it } from "vitest";
import { isUserFilePart, isUserImagePart } from "@renderer/utils/chat-message-parts";

describe("chat-message-parts", () => {
  it("detects image file parts including svg", () => {
    expect(
      isUserImagePart({
        type: "file",
        mediaType: "image/svg+xml",
        url: "file:///tmp/icon.svg",
        filename: "icon.svg",
      } as never)
    ).toBe(true);
  });

  it("detects non-image file parts", () => {
    expect(
      isUserFilePart({
        type: "file",
        mediaType: "application/pdf",
        url: "file:///tmp/doc.pdf",
        filename: "doc.pdf",
      } as never)
    ).toBe(true);
  });

  it("returns false for text parts and file parts without mediaType", () => {
    expect(isUserImagePart({ type: "text", text: "hello" } as never)).toBe(false);
    expect(isUserFilePart({ type: "text", text: "hello" } as never)).toBe(false);
    expect(
      isUserImagePart({
        type: "file",
        url: "file:///tmp/file",
        filename: "file",
      } as never)
    ).toBe(false);
    expect(
      isUserFilePart({
        type: "file",
        url: "file:///tmp/file",
        filename: "file",
      } as never)
    ).toBe(false);
  });
});
