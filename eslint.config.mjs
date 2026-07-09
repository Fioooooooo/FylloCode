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
const serviceDomains = ["platform", "workspace", "session", "proposal", "insight", "automation"];

/**
 * @typedef {import("eslint").Linter.Config} EslintConfig
 */

/**
 * @param {string} sourceDomain
 * @param {string[]} blockedDomains
 * @returns {EslintConfig}
 */
function serviceDomainImportGuards(sourceDomain, blockedDomains) {
  return {
    files: [`src/main/services/${sourceDomain}/**/*.ts`],
    ignores: [`src/main/services/${sourceDomain}/_public/**/*.ts`],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...blockedDomains.map((targetDomain) => ({
          selector: `ImportDeclaration[source.value=/^@main\\/services\\/${targetDomain}\\/(?!_public(?:$|\\/))/]`,
          message: `Cross-domain service imports must use @main/services/${targetDomain}/_public.`,
        })),
      ],
    },
  };
}

/**
 * @param {string} sourceDomain
 * @param {string[]} blockedDomains
 * @returns {EslintConfig}
 */
function rendererStoreApiImportGuard(sourceDomain, blockedDomains) {
  return {
    files: [`src/renderer/src/stores/${sourceDomain}/**/*.{ts,vue}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: blockedDomains.map((targetDomain) => ({
            group: [`@renderer/api/${targetDomain}`, `@renderer/api/${targetDomain}/**`],
            message: `Renderer stores must call ${targetDomain} through a public store/facade, not its API wrapper.`,
          })),
        },
      ],
    },
  };
}

let autoImportGlobals = {};
try {
  autoImportGlobals = require("./src/renderer/.eslintrc-auto-import.json").globals;
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
      "**/.worktrees",
      "docs/**",
      "**/auto-imports.d.ts",
      "**/components.d.ts",
      "src/renderer/.eslintrc-auto-import.json",
      "src/renderer/src/typed-router.d.ts",
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

  // --- Domain-first renderer guards ---------------------------------------
  {
    files: ["src/renderer/src/**/*.{ts,vue}"],
    ignores: ["src/renderer/src/api/**/*.{ts,vue}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='window'][property.name='api']",
          message: "Renderer code must access preload through src/renderer/src/api/** wrappers.",
        },
      ],
    },
  },
  ...serviceDomains.map((domain) =>
    rendererStoreApiImportGuard(
      domain,
      serviceDomains.filter((candidate) => candidate !== domain)
    )
  ),
  {
    files: ["src/renderer/src/**/*.{ts,vue}"],
    ignores: ["src/renderer/src/stores/**/*.{ts,vue}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@renderer/stores/*", "@renderer/stores/*/**"],
              message: "Import renderer stores from the @renderer/stores root barrel.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/renderer/src/stores/**/*.{ts,vue}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@renderer/stores",
              message:
                "Renderer store modules must not import the root store barrel; import a target domain barrel or direct store module.",
            },
          ],
          patterns: [
            {
              group: ["@renderer/stores/index", "@renderer/stores/index.*"],
              message:
                "Renderer store modules must not import the root store barrel; import a target domain barrel or direct store module.",
            },
          ],
        },
      ],
    },
  },

  // --- Main-process layering guard ----------------------------------------
  // Enforces dependency direction inside src/main/:
  //   ipc/      -> services/ only (plus shared + _kit)
  //   services/ -> domain/ + infra/
  //   domain/   -> shared only (no electron / services / infra)
  //   infra/    -> shared + npm (no services / domain / ipc)
  {
    files: ["src/main/domain/**/*.ts"],
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
            {
              group: ["fs", "fs/*", "node:fs", "node:fs/*"],
              message: "domain/ is pure knowledge; do fs IO in infra/ and pass data in",
            },
            {
              group: ["path", "node:path"],
              message: "domain/ must not build paths; resolve them in infra/ and pass data in",
            },
            {
              group: ["child_process", "node:child_process", "cross-spawn"],
              message: "domain/ must not spawn processes; that is an infra/ capability",
            },
            {
              group: ["os", "node:os"],
              message: "domain/ must not read OS/env; pass the values in from infra/ or services/",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/main/ipc/**/*.ts"],
    ignores: [
      "src/main/ipc/_kit/**/*.ts",
      // Domain refactor TODO: these stream/storage handlers still own low-level
      // port/runtime persistence glue. Keep exceptions explicit until that glue
      // is moved behind service APIs.
      "src/main/ipc/session/chat.ts",
      "src/main/ipc/proposal/apply.ts",
      "src/main/ipc/proposal/archive.ts",
      "src/main/ipc/proposal/browser.ts",
      "src/main/ipc/platform/acp-agents.ts",
      "src/main/ipc/platform/providers.ts",
      "src/main/ipc/insight/guidelines.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
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
              group: ["path", "node:path"],
              message: "ipc/ must not build paths directly; go through services/",
            },
            {
              group: ["child_process", "node:child_process"],
              message: "ipc/ must not spawn processes directly",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/^@main\\/infra\\/(?!logger(?:$|\\/))/]",
          message: "ipc/ handlers must access infra capabilities through services/.",
        },
      ],
    },
  },
  ...serviceDomains.map((domain) =>
    serviceDomainImportGuards(
      domain,
      serviceDomains.filter((candidate) => candidate !== domain)
    )
  ),
  {
    files: ["src/main/services/*/_public/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportAllDeclaration",
          message:
            "service/<domain>/_public must explicitly export stable methods; export * is forbidden.",
        },
        {
          selector:
            "ImportDeclaration[source.value=/^@main\\/services\\/(platform|workspace|session|proposal|insight|automation)\\//]",
          message: "service/<domain>/_public must not import another product domain service.",
        },
      ],
    },
  },
  {
    files: ["src/main/services/*/*/_public/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Only service/<domain>/_public is allowed; area-level _public directories are forbidden.",
        },
      ],
    },
  },
  {
    files: ["src/main/infra/**/*.ts"],
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
    ignores: [
      "src/main/**/*.ts",
      "src/main/**/*.mts",
      "src/main/**/*.tsx",
      "test/main/**/*.ts",
      "test/main/**/*.mts",
      "test/main/**/*.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@main/*", "@main/*/**"],
              message: "Only src/main/** and test/main/** may import @main/*",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/mcp-servers/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["electron", "electron/*"],
              message: "src/mcp-servers/ must not depend on Electron APIs",
            },
            {
              group: ["@main/*", "@main/*/**"],
              message: "src/mcp-servers/ must not depend on src/main aliases",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/mcp-servers/fyllo-specs/src/tools/**/*.ts"],
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
    files: ["src/mcp-servers/fyllo-specs/src/runtime-openspec/**/*.ts"],
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
