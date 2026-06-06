import { describe, expect, it, vi } from "vitest";

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => `/tmp/fyllocode-test/${subPath}`),
}));

import { encodeProjectPath, projectDir } from "@main/infra/storage/project-paths";

describe("project path storage helpers", () => {
  it("keeps the existing POSIX path encoding stable", () => {
    expect(encodeProjectPath("/Users/admin/Desktop/FylloCode")).toBe(
      "Users-admin-Desktop-FylloCode"
    );
  });

  it("encodes Windows drive paths as directory-safe project ids", () => {
    expect(encodeProjectPath("C:\\Users\\admin\\Desktop\\FylloCode")).toBe(
      "C-Users-admin-Desktop-FylloCode"
    );
  });

  it("replaces Windows filename-invalid characters outside the drive prefix", () => {
    expect(encodeProjectPath("C:\\Users\\admin\\Desktop\\foo<bar>|baz?")).toBe(
      "C-Users-admin-Desktop-foo-bar--baz-"
    );
  });

  it("uses the safe encoded id under the projects data directory", () => {
    expect(projectDir("C:\\Users\\admin\\Desktop\\FylloCode")).toBe(
      "/tmp/fyllocode-test/projects/C-Users-admin-Desktop-FylloCode"
    );
  });
});
