import { describe, expect, it } from "vitest";
import { parseLocalFileLink } from "@renderer/features/local-file-preview";

describe("parseLocalFileLink", () => {
  it.each([
    ["/Users/me/My%20Project/app.ts:12:3", "/Users/me/My Project/app.ts:12:3"],
    ["C%3A%5Cproject%5Csrc%5Capp.ts%3A8", "C:\\project\\src\\app.ts:8"],
    ["%5C%5Cserver%5Cshare%5Cfolder%5Cfile.md", "\\\\server\\share\\folder\\file.md"],
  ])("accepts absolute local path %s", (href, requestedPath) => {
    expect(parseLocalFileLink(href)).toEqual({ requestedPath });
  });

  it.each([
    "src/app.ts",
    "./app.ts",
    "file:///Users/me/app.ts",
    "https://example.com/app.ts",
    "mailto:user@example.com",
    "/Users/me/bad%ZZpath",
  ])("leaves non-candidate link %s alone", (href) => {
    expect(parseLocalFileLink(href)).toBeNull();
  });
});
