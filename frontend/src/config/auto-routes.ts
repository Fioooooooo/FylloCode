import { createRouter, createWebHashHistory } from "vue-router";
import { routes, handleHotUpdate } from "vue-router/auto-routes";

export const router = createRouter({
  routes,
  history: createWebHashHistory(),
});

if (import.meta.hot) {
  handleHotUpdate(router);
}
