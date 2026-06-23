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
        "@shared": resolve(__dirname, "src/shared"),
        "@main": resolve(__dirname, "src/main"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
        "@preload": resolve(__dirname, "src/preload"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    worker: {
      format: "es",
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
        },
      },
    },
    optimizeDeps: {
      exclude: ["markstream-vue", "stream-monaco"],
      include: ["monaco-editor"],
    },
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared"),
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
        root: resolve(__dirname, "src/renderer"),
        dts: "src/typed-router.d.ts",
        watch: command === "serve",
      }),
      vue(),
      ui({
        root: __dirname,
        autoImport: {
          eslintrc: {
            enabled: true,
            filepath: "src/renderer/.eslintrc-auto-import.json",
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
              overlay: "fixed inset-0 backdrop-blur-sm",
            },
            variants: {
              overlay: {
                true: {
                  overlay: "bg-slate-900/40",
                },
              },
            },
          },
        },
      }),
    ],
  },
}));
