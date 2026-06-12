import DefaultTheme from "vitepress/theme";
import { inBrowser, useRoute } from "vitepress";
import { watch, nextTick } from "vue";
import type { Theme } from "vitepress";
import "./custom.css";

declare global {
  interface Window {
    umami?: {
      track: (payload?: any) => void
    };
  }
}

const theme: Theme = {
  ...DefaultTheme,
  enhanceApp({app, router}) {
    if (!inBrowser) return;

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
