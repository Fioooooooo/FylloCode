import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [
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
          include: [
            "electron/main/__tests__/**/*.{test,spec}.ts",
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
      include: ["frontend/src", "electron/main", "shared"],
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
