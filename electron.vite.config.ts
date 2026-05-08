import { resolve } from "path";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import vueRouter from "vue-router/vite";
import ui from "@nuxt/ui/vite";

export default defineConfig(({ command }) => ({
  main: {
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "shared"),
        "@main": resolve(__dirname, "electron/main"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/main/index.ts"),
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "shared"),
        "@preload": resolve(__dirname, "electron/preload"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "frontend"),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "frontend/index.html"),
        },
      },
    },
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "frontend/src"),
        "@shared": resolve(__dirname, "shared"),
      },
    },
    plugins: [
      vueRouter({
        root: resolve(__dirname, "frontend"),
        dts: "src/typed-router.d.ts",
        watch: command === "serve",
      }),
      vue(),
      ui({
        autoImport: {
          eslintrc: {
            enabled: true,
            filepath: "frontend/.eslintrc-auto-import.json",
          },
        },
        prose: true,
        ui: {
          colors: {
            primary: "teal",
            secondary: "cyan",
            neutral: "slate",
          },
        },
      }),
    ],
  },
}));
