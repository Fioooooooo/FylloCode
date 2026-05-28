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
          include: ["frontend/src/__tests__/**/*.{test,spec}.{ts,vue}"],
          setupFiles: ["frontend/src/__tests__/setup.ts"],
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
            "electron/main/__tests__/**/*.{test,spec}.ts",
            "mcp-servers/fyllo-specs/__tests__/**/*.{test,spec}.ts",
            "mcp-servers/fyllo-skills/__tests__/**/*.{test,spec}.ts",
            "shared/__tests__/**/*.{test,spec}.ts",
          ],
          setupFiles: ["electron/main/__tests__/setup.ts"],
        },
        resolve: {
          alias: {
            "@main": resolve(__dirname, "electron/main"),
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
        "frontend/src",
        "electron/main",
        "mcp-servers/fyllo-specs",
        "mcp-servers/fyllo-skills",
        "shared",
      ],
      exclude: [
        "frontend/src/**/*.spec.ts",
        "frontend/src/**/*.test.ts",
        "frontend/src/**/*.d.ts",
        "frontend/src/typed-router.d.ts",
        "frontend/src/vite-env.d.ts",
        "frontend/src/__tests__/**",
        "frontend/src/config/**",
        "frontend/src/assets/**",
        "electron/main/**/*.spec.ts",
        "electron/main/**/*.test.ts",
        "electron/main/index.ts",
        "electron/main/bootstrap/**",
        "electron/main/**/*.d.ts",
        "electron/main/__tests__/**",
        "shared/**/*.spec.ts",
        "shared/**/*.test.ts",
        "shared/__tests__/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "frontend/src"),
      "@shared": resolve(__dirname, "shared"),
      "@main": resolve(__dirname, "electron/main"),
    },
  },
});
