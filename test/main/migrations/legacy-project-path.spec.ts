import { describe, expect, it } from "vitest";
import { encodeProjectPath, legacyProjectDataPath } from "@main/migrations/legacy-project-path";

describe("legacy Project path locator", () => {
  it("keeps the published POSIX and Windows encodings stable", () => {
    expect(encodeProjectPath("/Users/admin/Desktop/FylloCode")).toBe(
      "Users-admin-Desktop-FylloCode"
    );
    expect(encodeProjectPath("C:\\Users\\admin\\Desktop\\FylloCode")).toBe(
      "C-Users-admin-Desktop-FylloCode"
    );
  });

  it("preserves the known lossy candidate collision", () => {
    expect(encodeProjectPath("/Users/tao/work/my-app")).toBe(
      encodeProjectPath("/Users/tao/work/my/app")
    );
  });

  it("accepts only an explicit safe persisted legacy app-data key", () => {
    expect(legacyProjectDataPath("Users-tao-work-repo")).toMatch(/projects\/Users-tao-work-repo$/);
    for (const unsafe of ["", ".", "..", "nested/key", "nested\\key"]) {
      expect(() => legacyProjectDataPath(unsafe)).toThrow();
    }
  });
});
