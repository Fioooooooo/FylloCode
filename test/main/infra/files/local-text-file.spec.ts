import { promises as fs } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOCAL_FILE_PREVIEW_MAX_BYTES } from "@shared/types/local-file-preview";
import { createTestTempRoot } from "@test/main/test-temp-root";

const tempRoot = createTestTempRoot("fyllocode-local-text-");

describe("local text file infra", () => {
  beforeAll(async () => {
    await fs.mkdir(tempRoot, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("prefers an existing filename ending in colon-number", async () => {
    const path = `${tempRoot}/report:12`;
    await fs.writeFile(path, "exact");
    const { resolveLocalFileTarget } = await import("@main/infra/files/local-text-file");

    const result = await resolveLocalFileTarget(path);

    expect(result.canonicalPath).toBe(await fs.realpath(path));
    expect(result.line).toBeUndefined();
  });

  it("parses line and column only when the full path does not exist", async () => {
    const path = `${tempRoot}/source.ts`;
    await fs.writeFile(path, "line one\nline two");
    const { resolveLocalFileTarget } = await import("@main/infra/files/local-text-file");

    const result = await resolveLocalFileTarget(`${path}:12:3`);

    expect(result.canonicalPath).toBe(await fs.realpath(path));
    expect(result.line).toBe(12);
    expect(result.column).toBe(3);
  });

  it("accepts UTF-8 BOM and removes it from content", async () => {
    const path = `${tempRoot}/bom.md`;
    await fs.writeFile(path, Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("# Title")]));
    const { readLocalTextFile } = await import("@main/infra/files/local-text-file");

    await expect(readLocalTextFile(path)).resolves.toEqual(
      expect.objectContaining({ content: "# Title" })
    );
  });

  it("rejects directories and oversized files", async () => {
    const oversized = `${tempRoot}/large.txt`;
    await fs.writeFile(oversized, Buffer.alloc(LOCAL_FILE_PREVIEW_MAX_BYTES + 1, 0x61));
    const { readLocalTextFile, resolveLocalFileTarget } =
      await import("@main/infra/files/local-text-file");

    await expect(resolveLocalFileTarget(tempRoot)).rejects.toMatchObject({
      code: "NOT_REGULAR_FILE",
    });
    await expect(readLocalTextFile(oversized)).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("rejects NUL bytes and invalid UTF-8", async () => {
    const binary = `${tempRoot}/binary.txt`;
    const invalid = `${tempRoot}/invalid.txt`;
    await fs.writeFile(binary, Buffer.from([0x61, 0x00, 0x62]));
    await fs.writeFile(invalid, Buffer.from([0xc3, 0x28]));
    const { readLocalTextFile } = await import("@main/infra/files/local-text-file");

    await expect(readLocalTextFile(binary)).rejects.toMatchObject({ code: "BINARY_FILE" });
    await expect(readLocalTextFile(invalid)).rejects.toMatchObject({ code: "INVALID_UTF8" });
  });
});
