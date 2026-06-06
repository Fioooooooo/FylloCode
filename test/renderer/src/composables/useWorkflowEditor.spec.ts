import { ref } from "vue";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { useWorkflowEditor } from "@renderer/composables/useWorkflowEditor";

describe("useWorkflowEditor", () => {
  it("appends a new stage template with a unique id", () => {
    const yaml = ref(
      [
        "name: Demo",
        "stages:",
        "  - id: stage-code-review",
        "    name: Existing review",
        "    type: code-review",
      ].join("\n")
    );

    const editor = useWorkflowEditor(yaml);
    editor.appendStage("code-review");

    const document = load(yaml.value) as {
      stages?: Array<{ id?: string; type?: string }>;
    };

    expect(document.stages).toHaveLength(2);
    expect(document.stages?.[1]).toMatchObject({
      id: "stage-code-review-2",
      type: "code-review",
    });
  });

  it("updates the selected stage agent", () => {
    const yaml = ref(
      [
        "name: Demo",
        "stages:",
        "  - id: apply",
        "    name: Apply",
        "    type: proposal-apply",
      ].join("\n")
    );

    const editor = useWorkflowEditor(yaml);
    editor.updateStageAgent("apply", "agent-123");

    const document = load(yaml.value) as {
      stages?: Array<{ id?: string; agent?: string }>;
    };

    expect(document.stages?.[0].agent).toBe("agent-123");
  });

  it("reorders stages by the provided id order", () => {
    const yaml = ref(
      [
        "name: Demo",
        "stages:",
        "  - id: apply",
        "    name: Apply",
        "    type: proposal-apply",
        "  - id: review",
        "    name: Review",
        "    type: code-review",
      ].join("\n")
    );

    const editor = useWorkflowEditor(yaml);
    editor.reorderStages(["review", "apply"]);

    const document = load(yaml.value) as {
      stages?: Array<{ id?: string }>;
    };

    expect(document.stages?.map((stage) => stage.id)).toEqual(["review", "apply"]);
  });

  it("removes a stage by id", () => {
    const yaml = ref(
      [
        "name: Demo",
        "stages:",
        "  - id: apply",
        "    name: Apply",
        "    type: proposal-apply",
        "  - id: review",
        "    name: Review",
        "    type: code-review",
      ].join("\n")
    );

    const editor = useWorkflowEditor(yaml);
    editor.removeStage("apply");

    const document = load(yaml.value) as {
      stages?: Array<{ id?: string }>;
    };

    expect(document.stages?.map((stage) => stage.id)).toEqual(["review"]);
  });

  it("keeps yaml valid after removing the last stage", () => {
    const yaml = ref(
      [
        "name: Demo",
        "stages:",
        "  - id: apply",
        "    name: Apply",
        "    type: proposal-apply",
      ].join("\n")
    );

    const editor = useWorkflowEditor(yaml);
    editor.removeStage("apply");

    const document = load(yaml.value) as {
      stages?: Array<{ id?: string }>;
    };

    expect(document.stages).toEqual([]);
  });
});
