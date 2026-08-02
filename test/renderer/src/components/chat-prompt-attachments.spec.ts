import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AttachmentList from "@renderer/components/chat/prompt/AttachmentList.vue";
import type { ChatPromptAttachment } from "@renderer/utils/chat-prompt-attachment";

const attachments: ChatPromptAttachment[] = [
  {
    id: "image-1",
    isImage: true,
    name: "diagram.png",
    attachmentId: "00000000-0000-4000-8000-000000000001",
    mediaType: "image/png",
    previewUrl: "blob:diagram.png",
    sizeLabel: "24.0 KB",
    extensionLabel: "PNG",
  },
  {
    id: "file-1",
    isImage: false,
    name: "notes.md",
    attachmentId: "00000000-0000-4000-8000-000000000002",
    mediaType: "text/markdown",
    previewUrl: null,
    sizeLabel: "2.0 KB",
    extensionLabel: "MD",
  },
];

describe("AttachmentList", () => {
  it("stores opaque attachment handles without renderer file URIs", () => {
    expect(attachments.every((attachment) => attachment.attachmentId !== null)).toBe(true);
    expect(attachments.every((attachment) => !("uri" in attachment))).toBe(true);
  });

  it("renders mixed attachment previews", () => {
    const wrapper = mount(AttachmentList, {
      props: {
        attachments,
      },
    });

    expect(wrapper.findAll('button[aria-label^="移除"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("notes.md");
    expect(wrapper.text()).toContain("2.0 KB");
  });

  it("emits remove when a preview remove button is clicked", async () => {
    const wrapper = mount(AttachmentList, {
      props: {
        attachments,
      },
    });

    await wrapper.findAll('button[aria-label^="移除"]')[0]?.trigger("click");

    expect(wrapper.emitted("remove")).toEqual([["image-1"]]);
  });
});
