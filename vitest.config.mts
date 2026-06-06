import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import { resolve } from "path";
import { readFileSync } from "fs";

const mdRawForTests = {
  name: "md-raw-for-tests",
  enforce: "pre" as const,
  resolveId(id: string) {
    return id.endsWith(".md") ? `${id}?raw` : null;
  },
  load(id: string) {
    if (!id.endsWith(".md?raw")) {
      return null;
    }
    return `export default ${JSON.stringify(readFileSync(id.slice(0, -4), "utf8"))};`;
  },
};

export default defineConfig({
  plugins: [
    mdRawForTests,
    vue(),
    ui({
      autoImport: {
        eslintrc: { enabled: false },
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "renderer",
          environment: "happy-dom",
          globals: true,
          include: ["test/renderer/src/**/*.{test,spec}.{ts,vue}"],
          setupFiles: ["test/renderer/src/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "main",
          environment: "node",
          globals: true,
          testTimeout: 30000,
          hookTimeout: 30000,
          include: [
            "test/main/**/*.{test,spec}.ts",
            "test/preload/**/*.{test,spec}.ts",
            "test/mcp-servers/**/*.{test,spec}.ts",
            "test/shared/**/*.{test,spec}.ts",
          ],
          setupFiles: ["test/main/setup.ts"],
        },
        resolve: {
          alias: {
            "@main": resolve(__dirname, "src/main"),
            "@preload": resolve(__dirname, "src/preload"),
            "@test": resolve(__dirname, "test"),
          },
        },
      },
    ],
    coverage: {
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
      },
      include: [
        "src/renderer/src",
        "src/main",
        "src/mcp-servers/fyllo-specs",
        "src/mcp-servers/fyllo-skills",
        "src/shared",
      ],
      exclude: [
        "src/renderer/src/**/*.spec.ts",
        "src/renderer/src/**/*.test.ts",
        "src/renderer/src/**/*.d.ts",
        "src/renderer/src/typed-router.d.ts",
        "src/renderer/src/vite-env.d.ts",
        "src/renderer/src/config/**",
        "src/renderer/src/assets/**",
        "src/main/**/*.spec.ts",
        "src/main/**/*.test.ts",
        "src/main/index.ts",
        "src/main/bootstrap/**",
        "src/main/**/*.d.ts",
        "src/shared/**/*.spec.ts",
        "src/shared/**/*.test.ts",
        "test/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer/src"),
      "@shared": resolve(__dirname, "src/shared"),
      "@main": resolve(__dirname, "src/main"),
      "@preload": resolve(__dirname, "src/preload"),
      "@test": resolve(__dirname, "test"),
    },
  },
});
