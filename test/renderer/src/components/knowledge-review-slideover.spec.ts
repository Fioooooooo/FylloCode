import { flushPromises, mount, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeReviewSlideover from "@renderer/components/chat/knowledge/KnowledgeReviewSlideover.vue";

const readEntryMock = vi.hoisted(() => vi.fn());
const saveEntryMock = vi.hoisted(() => vi.fn());
const activeSessionId = vi.hoisted(() => ({ value: "session-1" as string | null }));

const rawContent =
  "---\nname: markstream-vue-theme-subscription\ncustomField: keep-me\n---\n\nInitial body";

vi.mock("@renderer/stores/insight/knowledge", () => ({
  useKnowledgeStore: () => ({
    readEntry: readEntryMock,
    saveEntry: saveEntryMock,
  }),
}));

vi.mock("@renderer/stores/workspace/project", () => ({
  useProjectStore: () => ({
    currentProject: { id: "project-1" },
  }),
}));

vi.mock("@renderer/stores/session/session", () => ({
  useSessionStore: () => ({
    get activeSessionId() {
      return activeSessionId.value;
    },
  }),
}));

function buttonByText(wrapper: VueWrapper, text: string): DOMWrapper<HTMLButtonElement> {
  const button = wrapper.findAll("button").find((node) => node.text() === text);
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button as DOMWrapper<HTMLButtonElement>;
}

async function mountKnowledgeReview(): Promise<VueWrapper> {
  const wrapper = mount(KnowledgeReviewSlideover, {
    props: {
      sessionId: "session-1",
      name: "markstream-vue-theme-subscription",
    },
  });
  await flushPromises();
  return wrapper;
}

describe("KnowledgeReviewSlideover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    activeSessionId.value = "session-1";
    readEntryMock.mockResolvedValue({
      ok: true,
      data: {
        name: "markstream-vue-theme-subscription",
        content: rawContent,
      },
    });
    saveEntryMock.mockImplementation((_projectId, input) =>
      Promise.resolve({
        ok: true,
        data: {
          name: input.name,
          content: input.content,
        },
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads and displays complete raw markdown including frontmatter", async () => {
    const wrapper = await mountKnowledgeReview();

    expect(readEntryMock).toHaveBeenCalledWith("project-1", {
      name: "markstream-vue-theme-subscription",
    });
    expect(
      (wrapper.get('[data-test="knowledge-body-editor"]').element as HTMLTextAreaElement).value
    ).toBe(rawContent);
  });

  it("saves edited raw markdown after the debounce", async () => {
    vi.useFakeTimers();
    const wrapper = await mountKnowledgeReview();

    const edited = "---\nname: markstream-vue-theme-subscription\ncustomField: edited\n---\n\nBody";
    await wrapper.get('[data-test="knowledge-body-editor"]').setValue(edited);
    await vi.advanceTimersByTimeAsync(700);
    await flushPromises();

    expect(saveEntryMock).toHaveBeenCalledWith("project-1", {
      name: "markstream-vue-theme-subscription",
      content: edited,
    });
  });

  it("flushes the latest edit and approves without sending chat messages", async () => {
    const wrapper = await mountKnowledgeReview();
    const edited = "---\nname: markstream-vue-theme-subscription\n---\n\nEdited body";

    await wrapper.get('[data-test="knowledge-body-editor"]').setValue(edited);
    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(saveEntryMock).toHaveBeenCalledWith("project-1", {
      name: "markstream-vue-theme-subscription",
      content: edited,
    });
    expect(wrapper.emitted("close")?.[0]).toEqual([{ status: "approved" }]);
  });

  it("keeps the slideover open when the active session changed", async () => {
    const wrapper = await mountKnowledgeReview();
    activeSessionId.value = "session-2";

    await buttonByText(wrapper, "确认").trigger("click");
    await flushPromises();

    expect(saveEntryMock).not.toHaveBeenCalled();
    expect(wrapper.emitted("close")).toBeUndefined();
    expect(wrapper.text()).toContain("当前聊天会话已切换");
  });
});
