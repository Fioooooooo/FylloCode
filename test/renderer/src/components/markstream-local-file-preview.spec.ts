import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOverlay } from "@nuxt/ui/composables";
import MarkStream from "@renderer/components/shared/MarkStream.vue";
import LocalFileLinkNode from "@renderer/features/local-file-preview/ui/LocalFileLinkNode.vue";
import { localFilePreviewHostKey } from "@renderer/features/local-file-preview/integration";

const markstreamMocks = vi.hoisted(() => ({
  setCustomComponents: vi.fn(),
  removeCustomComponents: vi.fn(),
}));

vi.mock("markstream-vue", () => ({
  default: {
    name: "MarkdownRender",
    props: ["customId", "content"],
    template: '<div data-test="markdown-render">{{ content }}</div>',
  },
  LinkNode: {
    name: "LinkNode",
    props: ["node"],
    template: '<a :href="node.href">{{ node.text }}</a>',
  },
  setCustomComponents: markstreamMocks.setCustomComponents,
  removeCustomComponents: markstreamMocks.removeCustomComponents,
}));

describe("MarkStream local file preview integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always registers the lightweight scoped link override", () => {
    mount(MarkStream, {
      props: {
        id: "document-1",
        content: "[file](/project/file.ts)",
        isStreaming: false,
        isDark: false,
      },
    });

    expect(markstreamMocks.setCustomComponents).toHaveBeenCalledWith("document-1", {
      link: expect.any(Object),
    });
  });

  it("does not create an overlay merely by mounting many MarkStreams", () => {
    const overlay = useOverlay() as unknown as { create: ReturnType<typeof vi.fn> };
    overlay.create.mockClear();
    const wrappers = Array.from({ length: 25 }, (_, index) =>
      mount(MarkStream, {
        props: {
          id: `document-${index}`,
          content: "plain text",
          isStreaming: false,
          isDark: false,
        },
      })
    );

    expect(markstreamMocks.setCustomComponents).toHaveBeenCalledTimes(25);
    expect(overlay.create).not.toHaveBeenCalled();
    for (const wrapper of wrappers) wrapper.unmount();
  });

  it("intercepts absolute paths and preserves default links for other hrefs", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const node = (href: string) => ({
      type: "link" as const,
      href,
      title: null,
      text: "target",
      children: [],
      raw: `[target](${href})`,
    });
    const wrapper = mount(LocalFileLinkNode, {
      props: { node: node("/project/file.ts"), indexKey: 0 },
      global: {
        provide: {
          [localFilePreviewHostKey as symbol]: { open },
        },
      },
    });

    await wrapper.get("a").trigger("click");
    expect(open).toHaveBeenCalledWith("/project/file.ts");

    for (const href of ["src/file.ts", "file:///project/file.ts", "https://example.com"]) {
      open.mockClear();
      await wrapper.setProps({ node: node(href) });
      await wrapper.get("a").trigger("click");
      expect(open).not.toHaveBeenCalled();
      expect(wrapper.get("a").attributes("href")).toBe(href);
    }
  });
});
