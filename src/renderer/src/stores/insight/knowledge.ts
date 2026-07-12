import { defineStore } from "pinia";
import { knowledgeApi } from "@renderer/api/insight/knowledge";

export const useKnowledgeStore = defineStore("knowledge", () => {
  return {
    readEntry: knowledgeApi.readEntry,
    saveEntry: knowledgeApi.saveEntry,
  };
});
