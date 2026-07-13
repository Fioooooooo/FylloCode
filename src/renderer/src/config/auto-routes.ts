import { createRouter, createWebHashHistory } from "vue-router";
import { routes, handleHotUpdate } from "vue-router/auto-routes";

// Electron renderer 中使用 hash history，避免 file:// 协议下路径解析问题。
export const router = createRouter({
  routes,
  history: createWebHashHistory(),
});

if (import.meta.hot) {
  handleHotUpdate(router);
}
