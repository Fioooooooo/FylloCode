import { describe, expect, it } from "vitest";
import { guidelineRefKey } from "@shared/types/guidelines";
import { proposalRefKey } from "@shared/types/proposal";
import { specRefKey } from "@shared/types/specs";
import { repositoryAggregateSchema } from "@shared/ipc/insight/repository-browser.schemas";
import { guidelineRefSchema } from "@shared/ipc/insight/guidelines.schemas";
import { specRefSchema } from "@shared/ipc/insight/specs.schemas";

describe("repository browser identities", () => {
  it("keeps the same repository-local ID distinct across Folders", () => {
    expect(specRefKey({ folderId: "folder-a", specId: "auth" })).not.toBe(
      specRefKey({ folderId: "folder-b", specId: "auth" })
    );
    expect(guidelineRefKey({ folderId: "folder-a", path: "guidelines/Testing.md" })).not.toBe(
      guidelineRefKey({ folderId: "folder-b", path: "guidelines/Testing.md" })
    );
    expect(proposalRefKey({ folderId: "folder-a", changeId: "same-change" })).not.toBe(
      proposalRefKey({ folderId: "folder-b", changeId: "same-change" })
    );
  });

  it("requires an owner Folder in SpecRef and GuidelineRef", () => {
    expect(specRefSchema.safeParse({ specId: "auth" }).success).toBe(false);
    expect(guidelineRefSchema.safeParse({ path: "guidelines/Testing.md" }).success).toBe(false);
  });

  it("validates aggregate Folder ownership and completeness", () => {
    const schema = repositoryAggregateSchema(specRefSchema);
    expect(
      schema.safeParse({
        folders: [
          {
            folderId: "folder-a",
            folderName: "A",
            folderPath: "/repo/a",
            isPrimary: true,
            status: "ready",
            items: [{ folderId: "folder-a", specId: "auth" }],
            warnings: [],
          },
        ],
        items: [{ folderId: "folder-a", specId: "auth" }],
        completeness: "complete",
        excludedFolderIds: [],
      }).success
    ).toBe(true);
  });
});
