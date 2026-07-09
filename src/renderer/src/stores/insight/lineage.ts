import { defineStore } from "pinia";
import { lineageApi } from "@renderer/api/insight/lineage";

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
