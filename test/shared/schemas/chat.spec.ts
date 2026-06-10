import { describe, expect, it } from "vitest";
import { createSessionInputSchema, setConfigOptionInputSchema } from "@shared/schemas/ipc/chat";

describe("createSessionInputSchema", () => {
  const base = {
    projectId: "p1",
    title: "Session",
    agentId: "claude-code",
  };

  it("accepts payload without fylloSessionId", () => {
    expect(createSessionInputSchema.parse(base)).toEqual(base);
  });

  it("accepts payload with fylloSessionId", () => {
    expect(
      createSessionInputSchema.parse({
        ...base,
        fylloSessionId: "session-probe",
      })
    ).toEqual({
      ...base,
      fylloSessionId: "session-probe",
    });
  });
});

describe("setConfigOptionInputSchema", () => {
  const baseSelect = {
    projectId: "p1",
    sessionId: "s1",
    configId: "model",
    type: "select" as const,
    value: "sonnet",
  };
  const baseBoolean = {
    projectId: "p1",
    sessionId: "s1",
    configId: "stream",
    type: "boolean" as const,
    value: true,
  };

  it("accepts valid select payload", () => {
    expect(setConfigOptionInputSchema.parse(baseSelect)).toEqual(baseSelect);
  });

  it("accepts valid boolean payload", () => {
    expect(setConfigOptionInputSchema.parse(baseBoolean)).toEqual(baseBoolean);
  });

  it("rejects boolean payload with string value", () => {
    const result = setConfigOptionInputSchema.safeParse({ ...baseBoolean, value: "true" });
    expect(result.success).toBe(false);
  });

  it("rejects select payload with boolean value", () => {
    const result = setConfigOptionInputSchema.safeParse({ ...baseSelect, value: true });
    expect(result.success).toBe(false);
  });

  it("rejects select payload with empty string value", () => {
    const result = setConfigOptionInputSchema.safeParse({ ...baseSelect, value: "" });
    expect(result.success).toBe(false);
  });

  it("rejects payload missing configId", () => {
    const { configId, ...rest } = baseSelect;
    void configId;
    const result = setConfigOptionInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects payload missing projectId", () => {
    const { projectId, ...rest } = baseSelect;
    void projectId;
    const result = setConfigOptionInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects payload missing sessionId", () => {
    const { sessionId, ...rest } = baseSelect;
    void sessionId;
    const result = setConfigOptionInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects payload with empty configId", () => {
    const result = setConfigOptionInputSchema.safeParse({ ...baseSelect, configId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects payload with unknown type", () => {
    const result = setConfigOptionInputSchema.safeParse({ ...baseSelect, type: "number" });
    expect(result.success).toBe(false);
  });
});
