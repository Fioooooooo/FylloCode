import { describe, expect, it } from "vitest";
import type { AcpSessionConfigOption, AcpSessionConfigSelect } from "@shared/types/acp-config";
import {
  createSpawnConfigPlanningState,
  findUniqueSpawnSelectOption,
  flattenSpawnSelectOptions,
  observeSpawnConfigSnapshot,
  planSpawnConfig,
  resolveSpawnSemanticConfig,
} from "@main/domain/session/spawn/spawn-config-resolution";

function select(
  id: string,
  category: string | undefined,
  values: Array<{ value: string; name: string; description?: string }>
): AcpSessionConfigSelect {
  return {
    id,
    name: id,
    type: "select",
    currentValue: values[0]?.value ?? "default",
    options: values,
    ...(category === undefined ? {} : { category }),
  };
}

describe("spawn-config-resolution", () => {
  it("flattens grouped options in provider order and preserves context", () => {
    const option = {
      ...select("model", "model", []),
      options: [
        {
          group: "openai",
          name: "OpenAI",
          options: [{ value: "openai/o3", name: "O3", description: "Fast" }],
        },
        {
          group: "router",
          name: "Router",
          options: [{ value: "router/o3", name: "O3" }],
        },
      ],
    };

    expect(flattenSpawnSelectOptions(option)).toEqual([
      { value: "openai/o3", name: "O3", group: "openai", description: "Fast" },
      { value: "router/o3", name: "O3", group: "router" },
    ]);
  });

  it("uses raw value, normalized value, normalized name, then token containment", () => {
    const options = [
      select("model", "model", [
        { value: "exact-value", name: "Exact" },
        { value: "Provider/Model-2026", name: "Friendly Model" },
      ]),
    ];
    expect(resolveSpawnSemanticConfig(options, "model", "exact-value")).toMatchObject({
      status: "resolved",
      value: "exact-value",
    });
    expect(resolveSpawnSemanticConfig(options, "model", " provider/model-2026 ")).toMatchObject({
      status: "resolved",
      value: "Provider/Model-2026",
    });
    expect(resolveSpawnSemanticConfig(options, "model", "friendly model")).toMatchObject({
      status: "resolved",
      value: "Provider/Model-2026",
    });
    expect(resolveSpawnSemanticConfig(options, "model", "provider model")).toMatchObject({
      status: "resolved",
      value: "Provider/Model-2026",
    });
  });

  it("returns unsupported options rather than using edit distance or a default", () => {
    const options = [
      select("model", "model", [
        { value: "openai/o3", name: "O3" },
        { value: "openai/o4", name: "O4" },
      ]),
    ];
    expect(resolveSpawnSemanticConfig(options, "model", "o5")).toMatchObject({
      status: "configuration_required",
      issue: {
        reason: "unsupported",
        candidates: [
          { value: "openai/o3", name: "O3" },
          { value: "openai/o4", name: "O4" },
        ],
      },
    });
  });

  it("keeps provider-qualified ambiguity in original order", () => {
    const options = [
      select("model", "model", [
        { value: "openai/gpt-5.6-luna", name: "Luna" },
        { value: "openrouter/gpt-5.6-luna-0731", name: "Luna" },
      ]),
    ];
    expect(resolveSpawnSemanticConfig(options, "model", "luna")).toMatchObject({
      status: "configuration_required",
      issue: {
        reason: "ambiguous",
        candidates: [
          { value: "openai/gpt-5.6-luna", name: "Luna" },
          { value: "openrouter/gpt-5.6-luna-0731", name: "Luna" },
        ],
      },
    });
  });

  it("rejects boolean options and missing or duplicate semantic categories", () => {
    const booleanOption: AcpSessionConfigOption = {
      id: "thinking",
      name: "Thinking",
      type: "boolean",
      category: "model",
      currentValue: false,
    };
    expect(findUniqueSpawnSelectOption([booleanOption], "model")).toBeUndefined();
    expect(resolveSpawnSemanticConfig([booleanOption], "model", "true")).toMatchObject({
      issue: { reason: "missing_category_option" },
    });
    const duplicate = [
      select("model-a", "model", [{ value: "a", name: "A" }]),
      select("model-b", "model", [{ value: "b", name: "B" }]),
    ];
    expect(resolveSpawnSemanticConfig(duplicate, "model", "a")).toMatchObject({
      issue: { reason: "missing_category_option", candidates: [] },
    });
  });

  it("plans semantic and raw constraints in mode/model/model_config/thought order", () => {
    const options: AcpSessionConfigOption[] = [
      {
        ...select("custom", undefined, [{ value: "default", name: "Default" }]),
        currentValue: "default",
      },
      {
        ...select("thought", "thought_level", [
          { value: "default", name: "Default" },
          { value: "high", name: "High" },
        ]),
        currentValue: "default",
      },
      {
        ...select("model-config", "model_config", [{ value: "default", name: "Default" }]),
        currentValue: "default",
      },
      {
        ...select("mode", "mode", [
          { value: "default", name: "Default" },
          { value: "plan", name: "Plan" },
        ]),
        currentValue: "default",
      },
      {
        ...select("model", "model", [
          { value: "default", name: "Default" },
          { value: "o3", name: "O3" },
        ]),
        currentValue: "default",
      },
    ];
    const request = {
      model: "o3",
      thought_level: "high",
      config: { mode: "plan", "model-config": "default", custom: "default" },
    };
    expect(planSpawnConfig(options, request)).toEqual({
      status: "apply",
      action: { optionId: "mode", type: "select", value: "plan" },
    });
    const afterMode = options.map((option) =>
      option.type === "select" && option.id === "mode"
        ? { ...option, currentValue: "plan" }
        : option
    );
    expect(planSpawnConfig(afterMode, request)).toEqual({
      status: "apply",
      action: { optionId: "model", type: "select", value: "o3" },
    });
  });

  it("deduplicates same semantic/raw target and rejects conflicting values", () => {
    const options = [
      select("model", "model", [
        { value: "openai/luna", name: "Luna" },
        { value: "router/luna", name: "Luna" },
      ]),
    ];
    expect(planSpawnConfig(options, { model: "luna", config: { model: "router/luna" } })).toEqual({
      status: "apply",
      action: { optionId: "model", type: "select", value: "router/luna" },
    });
    expect(
      planSpawnConfig(options, { model: "luna", config: { model: "unexpected" } })
    ).toMatchObject({ status: "invalid" });
  });

  it("detects repeated snapshots and bounded planning state", () => {
    const options = [select("model", "model", [{ value: "default", name: "Default" }])];
    let state = createSpawnConfigPlanningState({ model: "default" });
    const first = observeSpawnConfigSnapshot(state, options);
    expect(first.status).toBe("observed");
    state = first.state;
    expect(observeSpawnConfigSnapshot(state, options).status).toBe("repeated");
    expect(state.maxIterations).toBeGreaterThan(0);
  });
});
