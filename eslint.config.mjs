import { defineConfig } from "eslint/config";
import tseslint from "@electron-toolkit/eslint-config-ts";
import eslintConfigPrettier from "@electron-toolkit/eslint-config-prettier";
import eslintPluginVue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import { createRequire } from "module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));
const typeCheckedSourceFiles = ["**/*.{ts,mts,tsx,vue}"];

let autoImportGlobals = {};
try {
  autoImportGlobals = require("./frontend/.eslintrc-auto-import.json").globals;
} catch {
  // file not yet generated, run dev once to generate it
}

export default defineConfig(
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "**/out",
      "**/data",
      "**/auto-imports.d.ts",
      "**/components.d.ts",
      "frontend/.eslintrc-auto-import.json",
      "frontend/src/typed-router.d.ts",
    ],
  },
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typeCheckedSourceFiles,
  })),
  {
    files: typeCheckedSourceFiles,
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest.config.mts"],
        },
        tsconfigRootDir,
      },
    },
  },
  {
    files: typeCheckedSourceFiles,
    rules: {
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  eslintPluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        extraFileExtensions: [".vue"],
        parser: tseslint.parser,
        projectService: {
          allowDefaultProject: ["vitest.config.mts"],
        },
        tsconfigRootDir,
      },
      globals: autoImportGlobals,
    },
  },
  {
    files: ["**/*.{ts,mts,tsx,vue}"],
    rules: {
      "vue/require-default-prop": "off",
      "vue/multi-word-component-names": "off",
      "vue/block-lang": [
        "error",
        {
          script: {
            lang: "ts",
          },
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,tsx,vue}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value=/^(node:)?child_process$/] ImportSpecifier[imported.name=/^(spawn|spawnSync)$/]",
          message:
            "Use cross-spawn for process creation; native child_process spawn/spawnSync is not cross-platform safe.",
        },
      ],
    },
  },

  // --- Main-process layering guard ----------------------------------------
  // Enforces dependency direction inside electron/main/:
  //   ipc/      -> services/ only (plus shared + _kit)
  //   services/ -> domain/ + infra/
  //   domain/   -> shared only (no electron / services / infra)
  //   infra/    -> shared + npm (no services / domain / ipc)
  {
    files: ["electron/main/domain/**/*.ts"],
    // These domain files predate the layering guard and pull fs / infra
    // helpers for now. They will be split further in a future change;
    // the rule remains enforced for all other domain modules.
    ignores: [
      "electron/main/domain/acp/detector.ts",
      "electron/main/domain/integration/yunxiao/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["electron", "electron/*"],
              message: "domain/ must not depend on Electron APIs",
            },
            {
              group: ["@electron-toolkit/*"],
              message: "domain/ must not depend on Electron toolkit",
            },
            {
              group: ["@main/services/*"],
              message: "domain/ must not depend on services/",
            },
            {
              group: ["@main/infra/*"],
              message: "domain/ must not depend on infra/",
            },
            {
              group: ["@main/ipc/*"],
              message: "domain/ must not depend on ipc/",
            },
            {
              group: ["@main/bootstrap/*"],
              message: "domain/ must not depend on bootstrap/",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["electron/main/ipc/**/*.ts"],
    ignores: ["electron/main/ipc/_kit/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // infra/logger is cross-cutting and exempt; everything else in infra
              // must be accessed through a service.
              group: ["@main/infra/!(logger)", "@main/infra/!(logger)/**"],
              message: "ipc/ handlers must go through services/ (logger is the only exception)",
              allowTypeImports: true,
            },
            {
              group: ["@main/domain/*"],
              message: "ipc/ handlers must go through services/",
              allowTypeImports: true,
            },
            {
              group: ["fs", "fs/*", "node:fs", "node:fs/*"],
              message: "ipc/ must not touch fs directly",
            },
            {
              group: ["child_process", "node:child_process"],
              message: "ipc/ must not spawn processes directly",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["electron/main/infra/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@main/services/*"],
              message: "infra/ must not depend on services/",
            },
            {
              group: ["@main/ipc/*"],
              message: "infra/ must not depend on ipc/",
            },
            // infra IS allowed to use domain pure helpers — domain is "knowledge"
            // and infra is "capability"; capabilities using knowledge is fine.
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,mts,tsx,vue}"],
    ignores: ["electron/main/**/*.ts", "electron/main/**/*.mts", "electron/main/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@main/*", "@main/*/**"],
              message: "Only electron/main/** may import @main/*",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["mcp-servers/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["electron", "electron/*"],
              message: "mcp-servers/ must not depend on Electron APIs",
            },
            {
              group: ["@main/*", "@main/*/**"],
              message: "mcp-servers/ must not depend on electron/main aliases",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["mcp-servers/fyllo-specs/src/tools/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["child_process", "node:child_process"],
              message: "tool implementations must not spawn processes directly",
            },
            {
              group: ["@fission-ai/openspec", "@fission-ai/openspec/*"],
              message:
                "tools must go through openspec-runtime instead of importing openspec directly",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["mcp-servers/fyllo-specs/src/openspec-runtime/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@fission-ai/openspec", "@fission-ai/openspec/*"],
              message: "openspec-runtime must consume the CLI, not openspec internals",
            },
          ],
        },
      ],
    },
  },

  eslintConfigPrettier
);
