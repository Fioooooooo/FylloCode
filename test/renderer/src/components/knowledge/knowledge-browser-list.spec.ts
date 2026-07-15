import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import KnowledgeBrowserList from "@renderer/components/knowledge/KnowledgeBrowserList.vue";
import type { KnowledgeBrowserEntry, KnowledgeBrowserError } from "@shared/types/knowledge";

const entries: KnowledgeBrowserEntry[] = [
  {
    name: "active-newer",
    description: "Active entry",
    type: "project",
    updatedAt: "2026-07-03T00:00:00.000Z",
    status: "active",
  },
  {
    name: "unknown-entry",
    description: "Unknown entry",
    type: "project",
    updatedAt: "2026-07-02T00:00:00.000Z",
    status: "unknown",
  },
  {
    name: "suspect-entry",
    description: "Suspect entry",
    type: "project",
    updatedAt: "2026-07-01T00:00:00.000Z",
    status: "suspect",
  },
  {
    name: "reference-entry",
    description: "Reference entry",
    type: "reference",
    updatedAt: "2026-07-04T00:00:00.000Z",
    status: "active",
  },
];

const errors: KnowledgeBrowserError[] = [
  { path: "broken-entry.md", type: "parse", message: "Missing frontmatter", name: "broken-entry" },
  { path: "broken entry.md", type: "parse", message: "Invalid name" },
];

describe("KnowledgeBrowserList", () => {
  it("groups entries and sorts attention statuses before active entries", () => {
    const wrapper = mount(KnowledgeBrowserList, {
      props: { entries, errors: [], selectedName: null, loading: false },
    });

    expect(wrapper.find('[data-test="knowledge-group-project"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="knowledge-group-reference"]').exists()).toBe(true);
    expect(
      wrapper
        .findAll('[data-test="knowledge-list-item"]')
        .map((item) => item.attributes("data-name"))
    ).toEqual(["suspect-entry", "unknown-entry", "active-newer", "reference-entry"]);
    expect(wrapper.text()).toContain("suspect");
    expect(wrapper.text()).toContain("unknown");
    expect(wrapper.text()).toContain("active");
  });

  it("only emits selection for scanner errors with a validated name", async () => {
    const wrapper = mount(KnowledgeBrowserList, {
      props: { entries: [], errors, selectedName: null, loading: false },
    });

    await wrapper.get('[data-test="knowledge-error-item"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([["broken-entry"]]);
    expect(wrapper.find('[data-test="knowledge-error-item-disabled"]').text()).toContain(
      "broken entry.md"
    );
  });

  it("renders list loading skeletons", () => {
    const wrapper = mount(KnowledgeBrowserList, {
      props: { entries: [], errors: [], selectedName: null, loading: true },
    });

    expect(wrapper.find('[data-test="knowledge-list-loading"]').exists()).toBe(true);
  });
});
