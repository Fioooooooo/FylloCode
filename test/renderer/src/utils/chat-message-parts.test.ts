import { describe, expect, it } from "vitest";
import {
  getFilePartUrl,
  isUserFilePart,
  isUserImagePart,
} from "@renderer/utils/chat-message-parts";

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

  it("returns raw string URLs and falls back to empty string for missing or invalid values", () => {
    expect(
      getFilePartUrl({
        type: "file",
        mediaType: "image/png",
        url: "file:///tmp/demo.png",
        filename: "demo.png",
      } as never)
    ).toBe("file:///tmp/demo.png");
    expect(getFilePartUrl({ type: "text", text: "hello" } as never)).toBe("");
    expect(
      getFilePartUrl({
        type: "file",
        mediaType: "image/png",
        url: 123,
        filename: "demo.png",
      } as never)
    ).toBe("");
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
