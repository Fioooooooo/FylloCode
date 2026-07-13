import { defineStore } from "pinia";
import { lineageApi } from "@renderer/api/insight/lineage";

// lineage store 目前是 API wrapper 的薄封装，未来若加入本地缓存可在此收敛。
export const useLineageStore = defineStore("lineage", () => {
  return {
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
