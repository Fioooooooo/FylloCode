import { describe, expect, it } from "vitest";
import { buildStagePrompt } from "@main/services/proposal/stage-prompts";

describe("buildStagePrompt", () => {
  it("returns a minimal archive prompt without orchestration keywords", () => {
    const prompt = buildStagePrompt({
      changeId: "foo",
      projectPath: "/x",
      stage: {
        id: "archive",
        name: "归档",
        type: "proposal-archive",
      },
    });

    expect(prompt).toBe("归档 foo");
    expect(prompt).not.toContain("提交代码");
    expect(prompt).not.toContain("merge");
    expect(prompt).not.toContain("worktree");
    expect(prompt).not.toContain("commit");
  });
});
