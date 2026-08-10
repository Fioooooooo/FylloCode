import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionSearchModal from "@renderer/components/chat/SessionSearchModal.vue";
import { useWorkspaceStore } from "@renderer/stores";
import type { SessionSearchResult } from "@shared/types/chat";
import type { WorkspaceInfo } from "@shared/types/workspace";

const mocks = vi.hoisted(() => ({
  searchSessions: vi.fn(),
  openChatSession: vi.fn(),
}));

vi.mock("@renderer/api/session/chat", () => ({
  chatApi: { searchSessions: mocks.searchSessions },
}));

vi.mock("@renderer/composables/useOpenChatSession", () => ({
  useOpenChatSession: () => ({ openChatSession: mocks.openChatSession }),
}));

function workspace(id: string): WorkspaceInfo {
  return { id } as WorkspaceInfo;
}

function result(
  sessionId: string,
  title: string,
  snippet = `Snippet for ${title}`
): SessionSearchResult {
  return {
    sessionId,
    title,
    updatedAt: new Date("2026-08-10T08:00:00Z"),
    matchKind: "message",
    snippet,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function mountModal(open = true) {
  return mount(SessionSearchModal, { props: { open } });
}

async function enterQuery(wrapper: ReturnType<typeof mountModal>, query: string): Promise<void> {
  await wrapper.get('[data-test="session-search-input"]').setValue(query);
  await vi.advanceTimersByTimeAsync(300);
  await flushPromises();
}

describe("SessionSearchModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    useWorkspaceStore().currentWorkspace = workspace("workspace-1");
    mocks.searchSessions.mockReset();
    mocks.openChatSession.mockReset();
    mocks.openChatSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not search an empty or whitespace-only query", async () => {
    const wrapper = mountModal();
    expect(wrapper.get('[data-test="session-search-idle"]').text()).toContain("输入关键词搜索会话");

    await wrapper.get('[data-test="session-search-input"]').setValue("   ");
    await vi.advanceTimersByTimeAsync(500);

    expect(mocks.searchSessions).not.toHaveBeenCalled();
    expect(wrapper.find('[data-test="session-search-idle"]').exists()).toBe(true);
  });

  it("debounces a query and renders successful results", async () => {
    mocks.searchSessions.mockResolvedValue({
      ok: true,
      data: [result("session-1", "Session share page")],
    });
    const wrapper = mountModal();

    await wrapper.get('[data-test="session-search-input"]').setValue("session share");
    await vi.advanceTimersByTimeAsync(299);
    expect(mocks.searchSessions).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();

    expect(mocks.searchSessions).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      query: "session share",
    });
    expect(wrapper.get('[data-test="session-search-results"]').text()).toContain(
      "Session share page"
    );
  });

  it("serializes scans and lets only the latest query update results", async () => {
    const first = deferred<{ ok: true; data: SessionSearchResult[] }>();
    const second = deferred<{ ok: true; data: SessionSearchResult[] }>();
    mocks.searchSessions.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const wrapper = mountModal();

    await wrapper.get('[data-test="session-search-input"]').setValue("first");
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.searchSessions).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-test="session-search-input"]').setValue("second");
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.searchSessions).toHaveBeenCalledTimes(1);

    first.resolve({ ok: true, data: [result("session-old", "Old result")] });
    await flushPromises();
    expect(mocks.searchSessions).toHaveBeenCalledTimes(2);
    expect(mocks.searchSessions).toHaveBeenLastCalledWith({
      workspaceId: "workspace-1",
      query: "second",
    });

    second.resolve({ ok: true, data: [result("session-new", "Latest result")] });
    await flushPromises();

    expect(wrapper.get('[data-test="session-search-results"]').text()).toContain("Latest result");
    expect(wrapper.text()).not.toContain("Old result");
  });

  it("shows empty and error states and can retry the current query", async () => {
    mocks.searchSessions
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "SEARCH_FAILED", message: "Disk read failed" },
      })
      .mockResolvedValueOnce({ ok: true, data: [result("session-retry", "Retry result")] });
    const wrapper = mountModal();

    await enterQuery(wrapper, "missing");
    expect(wrapper.get('[data-test="session-search-empty"]').text()).toContain("没有匹配的会话");

    await enterQuery(wrapper, "broken");
    expect(wrapper.get('[data-test="session-search-error"]').text()).toContain("Disk read failed");

    await wrapper.get('[data-test="session-search-error"] button').trigger("click");
    await vi.runAllTimersAsync();
    await flushPromises();
    expect(wrapper.get('[data-test="session-search-results"]').text()).toContain("Retry result");
  });

  it("discards late results after closing or switching Workspace", async () => {
    const closing = deferred<{ ok: true; data: SessionSearchResult[] }>();
    const switching = deferred<{ ok: true; data: SessionSearchResult[] }>();
    mocks.searchSessions
      .mockReturnValueOnce(closing.promise)
      .mockReturnValueOnce(switching.promise);
    const wrapper = mountModal();

    await wrapper.get('[data-test="session-search-input"]').setValue("closing");
    await vi.advanceTimersByTimeAsync(300);
    await wrapper.setProps({ open: false });
    closing.resolve({ ok: true, data: [result("session-closed", "Closed result")] });
    await flushPromises();
    expect(wrapper.text()).not.toContain("Closed result");

    await wrapper.setProps({ open: true });
    await nextTick();
    await wrapper.get('[data-test="session-search-input"]').setValue("switching");
    await vi.advanceTimersByTimeAsync(300);
    useWorkspaceStore().currentWorkspace = workspace("workspace-2");
    await nextTick();
    switching.resolve({ ok: true, data: [result("session-switched", "Switched result")] });
    await flushPromises();

    expect(wrapper.get<HTMLInputElement>('[data-test="session-search-input"]').element.value).toBe(
      ""
    );
    expect(wrapper.text()).not.toContain("Switched result");
  });

  it("keeps results visible on open failure and closes after a successful retry", async () => {
    mocks.searchSessions.mockResolvedValue({
      ok: true,
      data: [result("session-1", "Open me")],
    });
    mocks.openChatSession.mockRejectedValueOnce(new Error("Session no longer exists"));
    const wrapper = mountModal();
    await enterQuery(wrapper, "open");

    await wrapper.get('[data-test="session-search-result-session-1"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-test="session-search-open-error"]').text()).toContain(
      "Session no longer exists"
    );
    expect(wrapper.get('[data-test="session-search-results"]').text()).toContain("Open me");

    mocks.openChatSession.mockResolvedValueOnce(undefined);
    await wrapper.get('[data-test="session-search-result-session-1"]').trigger("click");
    await flushPromises();
    expect(mocks.openChatSession).toHaveBeenLastCalledWith("session-1");
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
  });
});
