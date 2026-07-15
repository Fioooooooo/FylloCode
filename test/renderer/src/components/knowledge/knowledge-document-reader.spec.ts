import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import KnowledgeDocumentReader from "@renderer/components/knowledge/KnowledgeDocumentReader.vue";

vi.mock("@renderer/components/shared/MarkStream.vue", () => ({
  default: {
    name: "MarkStream",
    props: ["content", "enableActions"],
    template:
      '<div data-test="markstream-stub" :data-actions="String(enableActions)">{{ content }}</div>',
  },
}));

const baseProps = {
  name: "entry-name",
  description: "Entry description",
  status: "suspect" as const,
  content: "```yaml\n---\nname: entry-name\n---\n```\n\nBody",
  loading: false,
  error: null,
  indexError: null,
  deleteError: null,
  deleting: false,
  canDelete: true,
};

describe("KnowledgeDocumentReader", () => {
  it("renders status, markdown and a disabled action host", () => {
    const wrapper = mount(KnowledgeDocumentReader, { props: baseProps });

    expect(wrapper.text()).toContain("entry-name");
    expect(wrapper.text()).toContain("suspect");
    expect(wrapper.get('[data-test="markstream-stub"]').text()).toContain("name: entry-name");
    expect(wrapper.get('[data-test="markstream-stub"]').attributes("data-actions")).toBe("false");
  });

  it("emits delete intent and presents index/delete errors", async () => {
    const wrapper = mount(KnowledgeDocumentReader, {
      props: {
        ...baseProps,
        indexError: "Frontmatter is invalid",
        deleteError: "Delete failed, retry.",
      },
    });

    await wrapper.get('[data-test="knowledge-delete-button"]').trigger("click");

    expect(wrapper.emitted("delete")).toHaveLength(1);
    expect(wrapper.text()).toContain("Frontmatter is invalid");
    expect(wrapper.text()).toContain("Delete failed, retry.");
  });

  it("shows an explicit empty page when nothing is selected", () => {
    const wrapper = mount(KnowledgeDocumentReader, {
      props: { ...baseProps, name: null, description: null, status: null, canDelete: false },
    });

    expect(wrapper.get('[data-test="knowledge-page-empty"]').text()).toContain("暂无知识沉淀");
    expect(wrapper.find('[data-test="knowledge-delete-button"]').exists()).toBe(false);
  });
});
