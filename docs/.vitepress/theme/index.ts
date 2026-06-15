import DefaultTheme from "vitepress/theme";
import { inBrowser } from "vitepress";
import { watch, nextTick } from "vue";
import type { Theme } from "vitepress";
import "./custom.css";
import VitePressMermaid from "../plugins/vitepress-mermaid/index.vue";

declare global {
  interface Window {
    umami?: {
      track: (payload?: any) => void
    };
  }
}

const theme: Theme = {
  ...DefaultTheme,
  enhanceApp({ app, router }) {
    if (!inBrowser) return;

    // Registry theme
    app.component("vitepress-mermaid", VitePressMermaid);

    // Send event when route path changed
    const route = router.route;
    watch(
      () => route.path,
      async () => {
        await nextTick();

        window.umami?.track();
      },
      { immediate: true },
    );
  },
};

export default theme;
