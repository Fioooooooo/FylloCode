import { ref } from "vue";
import { defineStore } from "pinia";
import { lineageApi } from "@renderer/api/insight/lineage";
import type { LineageBrowserData } from "@shared/types/lineage";

// lineage store 目前是 API wrapper 的薄封装，未来若加入本地缓存可在此收敛。
export const useLineageStore = defineStore("lineage", () => {
  const browserData = ref<LineageBrowserData | null>(null);
  const browserLoading = ref(false);
  const browserError = ref<string | null>(null);
  let browserRequestId = 0;

  async function loadBrowser(projectId: string): Promise<void> {
    const requestId = ++browserRequestId;
    browserData.value = null;
    browserLoading.value = true;
    browserError.value = null;

    try {
      const response = await lineageApi.getBrowser(projectId);
      if (requestId !== browserRequestId) {
        return;
      }

      if (response.ok) {
        browserData.value = response.data;
      } else {
        browserError.value = response.error.message;
      }
    } catch (error: unknown) {
      if (requestId !== browserRequestId) {
        return;
      }
      browserError.value = error instanceof Error ? error.message : "工作脉络加载失败";
    } finally {
      if (requestId === browserRequestId) {
        browserLoading.value = false;
      }
    }
  }

  function clearBrowser(): void {
    browserRequestId += 1;
    browserData.value = null;
    browserLoading.value = false;
    browserError.value = null;
  }

  return {
    browserData,
    browserLoading,
    browserError,
    loadBrowser,
    clearBrowser,
    ensureTaskSubject: lineageApi.ensureTaskSubject,
    linkTaskSession: lineageApi.linkTaskSession,
    getByTask: lineageApi.getByTask,
    getBySession: lineageApi.getBySession,
    createSessionTask: lineageApi.createSessionTask,
    readPlan: lineageApi.readPlan,
    savePlanBody: lineageApi.savePlanBody,
    approvePlan: lineageApi.approvePlan,
  };
});
