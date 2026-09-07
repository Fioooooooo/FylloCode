import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@shared/types/workflow";
import {
  parseWorkflowDefinitionForGraph,
  workflowDefinitionToMermaid,
} from "@renderer/features/workflow-editor";

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({
  default: mermaidMocks,
}));

import WorkflowGraph from "@renderer/features/workflow-editor/ui/WorkflowGraph.vue";

function definition(): WorkflowDefinition {
  return {
    name: "发布流程",
    version: 2,
    stages: [
      {
        id: "检查 [代码]",
        name: '检查 "代码"',
        kind: "agent",
        context: "fresh",
        prompt: "检查",
        produces: { id: "result", schema: "freeform" },
        next: [
          { on: "pass", goto: "写回", maxLoops: 2 },
          { on: "fail", goto: "写回" },
        ],
      },
      {
        id: "写回",
        kind: "action",
        op: { type: "exec", command: "true" },
        next: [{ on: "pass", goto: "检查 [代码]" }],
      },
    ],
  };
}

describe("workflow graph model", () => {
  it("converts stage nodes, pass/fail edges, loops, Chinese and special labels", () => {
    const graph = workflowDefinitionToMermaid(definition());

    expect(graph).toContain("flowchart TD");
    expect(graph).toContain("检查 #34;代码#34;");
    expect(graph).toContain("检查 #91;代码#93;");
    expect(graph).toContain("agent");
    expect(graph).toContain("pass #40;maxLoops=2#41;");
    expect(graph).toContain("fail");
    expect(graph).toContain("stage_1 -->|pass| stage_0");
    expect(graph).not.toContain("status");
  });

  it("keeps duplicate and cyclic transitions as separate renderable edges", () => {
    const graph = workflowDefinitionToMermaid({
      ...definition(),
      stages: [
        {
          ...definition().stages[0]!,
          next: [
            { on: "pass", goto: "检查 [代码]" },
            { on: "pass", goto: "检查 [代码]" },
          ],
        },
        definition().stages[1]!,
      ],
    });

    expect(graph.match(/stage_0 -->\|pass\| stage_0/g)).toHaveLength(2);
  });

  it("returns a parser error without producing a definition for invalid YAML", () => {
    expect(parseWorkflowDefinitionForGraph("name: [broken")).toEqual({
      definition: null,
      error: expect.any(String),
    });
  });
});

describe("WorkflowGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the current definition and clears stale SVG on render failure", async () => {
    mermaidMocks.render.mockResolvedValueOnce({ svg: '<svg data-test="graph-svg" />' });
    const wrapper = mount(WorkflowGraph, {
      props: { definition: definition(), parseError: null },
    });
    await flushPromises();
    expect(wrapper.get('[data-test="workflow-graph-svg"]').html()).toContain("graph-svg");

    mermaidMocks.render.mockRejectedValueOnce(new Error("mermaid failed"));
    await wrapper.setProps({
      definition: { ...definition(), name: "新的流程" },
    });
    await flushPromises();

    expect(wrapper.get('[data-test="workflow-graph-render-error"]').text()).toContain(
      "mermaid failed"
    );
    expect(wrapper.find('[data-test="workflow-graph-svg"]').exists()).toBe(false);
  });

  it("shows parser errors without rendering a previous graph", async () => {
    const wrapper = mount(WorkflowGraph, {
      props: { definition: null, parseError: "version 必须是 2" },
    });
    await flushPromises();

    expect(wrapper.get('[data-test="workflow-graph-parse-error"]').text()).toContain(
      "version 必须是 2"
    );
    expect(mermaidMocks.render).not.toHaveBeenCalled();
  });
});
