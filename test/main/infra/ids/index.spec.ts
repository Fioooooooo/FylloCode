import { describe, expect, it } from "vitest";
import {
  newArchiveFylloSessionId,
  newRunId,
  newSessionId,
  newStageFylloSessionId,
} from "@main/infra/ids";

describe("infra/ids", () => {
  it("newSessionId produces strictly-ordered unique values", async () => {
    const a = newSessionId();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const b = newSessionId();
    expect(a).toMatch(/^session-\d+$/);
    expect(b).toMatch(/^session-\d+$/);
    expect(a).not.toBe(b);
  });

  it("newRunId produces run-prefixed ids", async () => {
    const id = newRunId();
    expect(id).toMatch(/^run-\d+$/);
  });

  it("newStageFylloSessionId composes from runId + stageIndex", () => {
    expect(newStageFylloSessionId("run-1", 0)).toBe("run-1-0");
    expect(newStageFylloSessionId("run-1", 7)).toBe("run-1-7");
  });

  it("newArchiveFylloSessionId composes from runId", () => {
    expect(newArchiveFylloSessionId("run-1")).toBe("run-1-archive");
  });
});
