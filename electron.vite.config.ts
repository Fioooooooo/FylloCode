import { resolve } from "path";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import vueRouter from "vue-router/vite";
import ui from "@nuxt/ui/vite";
import monacoEditorEsmPlugin from "vite-plugin-monaco-editor-esm";

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
    worker: {
      format: "es",
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "frontend/index.html"),
        },
      },
    },
    optimizeDeps: {
      exclude: ["markstream-vue", "stream-monaco"],
      include: ["monaco-editor"],
    },
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "frontend/src"),
        "@shared": resolve(__dirname, "shared"),
      },
    },
    plugins: [
      monacoEditorEsmPlugin({
        languageWorkers: [],
        customWorkers: [
          {
            label: "editorWorkerService",
            entry: "monaco-editor/esm/vs/editor/editor.worker.js",
          },
          {
            label: "typescript",
            entry: "monaco-editor/esm/vs/language/typescript/ts.worker.js",
          },
          {
            label: "css",
            entry: "monaco-editor/esm/vs/language/css/css.worker.js",
          },
          {
            label: "html",
            entry: "monaco-editor/esm/vs/language/html/html.worker.js",
          },
          {
            label: "json",
            entry: "monaco-editor/esm/vs/language/json/json.worker.js",
          },
        ],
        customDistPath(_root, buildOutDir) {
          return resolve(buildOutDir, "monacoeditorwork");
        },
      }),
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
          modal: {
            slots: {
              footer: "justify-end gap-2",
            },
          },
        },
      }),
    ],
  },
}));
