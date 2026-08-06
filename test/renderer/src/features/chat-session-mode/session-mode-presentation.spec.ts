import { describe, expect, it } from "vitest";
import { getSessionModePresentation } from "@renderer/features/chat-session-mode";

describe("session mode presentation", () => {
  it("keeps the agreed labels and tooltip copy exhaustive", () => {
    expect(getSessionModePresentation("fyllocode")).toEqual({
      label: "FylloCode",
      tooltip: "结合项目规范、规约与知识，按 FylloCode 工作流程协作并沉淀成果。",
    });
    expect(getSessionModePresentation("native")).toEqual({
      label: "原生",
      tooltip: "保持 Agent 默认的工作方式，不做改变。",
    });
  });
});
