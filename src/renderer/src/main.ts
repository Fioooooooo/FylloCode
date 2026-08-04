import "./assets/main.css";
import { createApp, nextTick } from "vue";
import { createPinia } from "pinia";
import ui from "@nuxt/ui/vue-plugin";
import App from "./App.vue";
import "./config/auto-icon";
import { router } from "./config/auto-routes";
import { installErrorReporting } from "./config/error-reporting";
import "./config/markstream";
import { registerBootstrapTasks, runBootstrapTasks } from "./bootstrap";
import { lifecycleApi } from "./api/platform/lifecycle";

const pinia = createPinia();
const app = createApp(App);

installErrorReporting(app, {
  getRoute: () => router.currentRoute.value.fullPath,
});

app.use(pinia).use(router).use(ui).mount("#app");

registerBootstrapTasks();
void runBootstrapTasks(
  { pinia, router },
  {
    async onCriticalSettled() {
      await nextTick();
      lifecycleApi.markInteractive();
    },
  }
);
