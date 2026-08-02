import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tempRoot } = await vi.hoisted(async () => {
  const { createTestTempRoot } = await import("@test/main/test-temp-root");
  return { tempRoot: createTestTempRoot("fyllocode-legacy-delete-") };
});

vi.mock("@main/infra/paths", () => ({
  getDataSubPath: vi.fn((subPath: string) => join(tempRoot, subPath)),
}));

import {
  deleteLegacyProjectDataByAppDataKey,
  deleteLegacyProjectMetaRecord,
} from "@main/migrations/legacy-project-store";

describe("legacy Project deletion", () => {
  beforeEach(() => rmSync(tempRoot, { recursive: true, force: true }));
  afterEach(() => rmSync(tempRoot, { recursive: true, force: true }));

  it("deletes only the explicit provenance key and stable legacy meta ID", async () => {
    const source = join(tempRoot, "projects", "persisted-key");
    const collision = join(tempRoot, "projects", "path-derived-collision");
    const meta = join(tempRoot, "projects", "workspace-1", "meta.json");
    for (const path of [source, collision, join(tempRoot, "projects", "workspace-1")]) {
      mkdirSync(path, { recursive: true });
    }
    writeFileSync(join(source, "session.json"), "{}", "utf8");
    writeFileSync(join(collision, "session.json"), "{}", "utf8");
    writeFileSync(meta, "{}", "utf8");

    await deleteLegacyProjectDataByAppDataKey("persisted-key");
    await deleteLegacyProjectMetaRecord("workspace-1");
    await deleteLegacyProjectDataByAppDataKey("persisted-key");

    expect(existsSync(source)).toBe(false);
    expect(existsSync(meta)).toBe(false);
    expect(existsSync(collision)).toBe(true);
  });
});
