import { describe, expect, it } from "vitest";
import type { AcpSessionConfigOption } from "@shared/types/acp-config";
import {
  planSessionConfigRecovery,
  sessionConfigFingerprint,
  valueExistsInSchema,
} from "@main/domain/session/chat/session-config-recovery";

function select(
  id: string,
  currentValue: string,
  values: string[] = ["default", "saved"]
): AcpSessionConfigOption {
  return {
    id,
    name: id,
    type: "select",
    currentValue,
    options: values.map((value) => ({ value, name: value })),
  };
}

describe("session-config-recovery", () => {
  it("skips values that already match and preserves persisted candidate order", () => {
    const plan = planSessionConfigRecovery(
      [select("model", "saved"), select("mode", "saved"), select("thought", "saved")],
      [select("model", "saved"), select("mode", "default"), select("thought", "default")]
    );

    expect(plan).toEqual({
      candidates: [
        { configId: "mode", type: "select", value: "saved" },
        { configId: "thought", type: "select", value: "saved" },
      ],
      incompatibilities: [],
    });
  });

  it("classifies removed, type-changed, and invalid select values", () => {
    const plan = planSessionConfigRecovery(
      [select("removed", "saved"), select("changed", "saved"), select("invalid", "saved")],
      [
        {
          id: "changed",
          name: "changed",
          type: "boolean",
          currentValue: false,
        },
        select("invalid", "default", ["default"]),
      ]
    );

    expect(plan).toEqual({
      candidates: [],
      incompatibilities: [
        { configId: "removed", reason: "removed" },
        { configId: "changed", reason: "type_changed" },
        { configId: "invalid", reason: "invalid_value" },
      ],
    });
  });

  it("supports boolean values and grouped select schemas", () => {
    const grouped: AcpSessionConfigOption = {
      id: "model",
      name: "Model",
      type: "select",
      currentValue: "small",
      options: [
        {
          group: "premium",
          name: "Premium",
          options: [{ value: "large", name: "Large" }],
        },
      ],
    };

    expect(valueExistsInSchema(grouped, "large")).toBe(true);
    expect(valueExistsInSchema(grouped, "missing")).toBe(false);
    expect(
      valueExistsInSchema(
        { id: "thinking", name: "Thinking", type: "boolean", currentValue: false },
        true
      )
    ).toBe(true);
    expect(
      planSessionConfigRecovery(
        [
          { id: "thinking", name: "Thinking", type: "boolean", currentValue: true },
          { ...grouped, currentValue: "large" },
        ],
        [{ id: "thinking", name: "Thinking", type: "boolean", currentValue: false }, grouped]
      ).candidates
    ).toEqual([
      { configId: "thinking", type: "boolean", value: true },
      { configId: "model", type: "select", value: "large" },
    ]);
  });

  it("forces persisted candidates when the lifecycle response omits configOptions", () => {
    expect(planSessionConfigRecovery([select("model", "saved")], null)).toEqual({
      candidates: [{ configId: "model", type: "select", value: "saved" }],
      incompatibilities: [],
    });
  });

  it("fingerprints recovery-relevant schema independently of option ordering", () => {
    const first = [select("model", "saved"), select("mode", "default")];
    const second = [select("mode", "default"), select("model", "saved")];

    expect(sessionConfigFingerprint(first)).toBe(sessionConfigFingerprint(second));
    expect(sessionConfigFingerprint(first)).not.toBe(
      sessionConfigFingerprint([select("model", "default"), select("mode", "default")])
    );
  });
});
