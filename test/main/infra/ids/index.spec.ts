import { describe, expect, it } from "vitest";
import {
  newArchiveFylloSessionId,
  newRunId,
  newSessionId,
  newStageFylloSessionId,
  newSubjectId,
  newTaskId,
} from "@main/infra/ids";

describe("infra/ids", () => {
  it("newTaskId produces task-prefixed nanoids", () => {
    const id = newTaskId();
    expect(id).toMatch(/^task-[A-Za-z0-9_-]{10}$/);
  });

  it("newSessionId produces session-prefixed unique nanoids", () => {
    const a = newSessionId();
    const b = newSessionId();
    expect(a).toMatch(/^session-[A-Za-z0-9_-]{10}$/);
    expect(b).toMatch(/^session-[A-Za-z0-9_-]{10}$/);
    expect(a).not.toBe(b);
  });

  it("newRunId produces run-prefixed nanoids", () => {
    const id = newRunId();
    expect(id).toMatch(/^run-[A-Za-z0-9_-]{10}$/);
  });

  it("newSubjectId produces subject-prefixed nanoids", () => {
    const id = newSubjectId();
    expect(id).toMatch(/^subject-[A-Za-z0-9_-]{10}$/);
  });

  it("newStageFylloSessionId composes from runId + stageIndex", () => {
    expect(newStageFylloSessionId("run-1", 0)).toBe("run-1-0");
    expect(newStageFylloSessionId("run-1", 7)).toBe("run-1-7");
  });

  it("newArchiveFylloSessionId composes from runId", () => {
    expect(newArchiveFylloSessionId("run-1")).toBe("run-1-archive");
  });
});
