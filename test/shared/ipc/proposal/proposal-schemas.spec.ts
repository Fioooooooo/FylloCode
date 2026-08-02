import { describe, expect, it } from "vitest";
import { applyInputSchema, stageStreamInputSchema } from "@shared/ipc/proposal/apply.schemas";
import { archiveInputSchema } from "@shared/ipc/proposal/archive.schemas";
import {
  getProposalSpecDeltasInputSchema,
  readProposalFileInputSchema,
  watchProposalInputSchema,
} from "@shared/ipc/proposal/browser.schemas";

const proposalRef = {
  workspaceId: "workspace-1",
  folderId: "folder-2",
  changeId: "add-search",
};

describe("proposal IPC schemas", () => {
  it("requires Folder-qualified selectors for executable proposal operations", () => {
    expect(applyInputSchema.parse({ ...proposalRef, workflowId: "workflow-1" })).toEqual({
      ...proposalRef,
      workflowId: "workflow-1",
    });
    expect(archiveInputSchema.parse(proposalRef)).toEqual(proposalRef);
    expect(() =>
      applyInputSchema.parse({
        workspaceId: proposalRef.workspaceId,
        changeId: proposalRef.changeId,
      })
    ).toThrow();
  });

  it("requires Folder-qualified selectors for browser and stream operations", () => {
    expect(readProposalFileInputSchema.parse({ ...proposalRef, filename: "proposal.md" })).toEqual({
      ...proposalRef,
      filename: "proposal.md",
    });
    expect(getProposalSpecDeltasInputSchema.parse(proposalRef)).toEqual(proposalRef);
    expect(watchProposalInputSchema.parse({ ...proposalRef, sessionId: "session-1" })).toEqual({
      ...proposalRef,
      sessionId: "session-1",
    });
    expect(
      stageStreamInputSchema.parse({
        ...proposalRef,
        runId: "run-1",
        stageIndex: 0,
      })
    ).toMatchObject(proposalRef);
  });
});
