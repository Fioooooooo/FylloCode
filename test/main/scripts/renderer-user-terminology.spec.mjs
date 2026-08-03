import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";
import { describe, expect, it } from "vitest";
import rendererUserTerminology from "../../../scripts/eslint-rules/renderer-user-terminology.mjs";

const linter = new Linter();
const plugin = {
  rules: {
    "no-internal-user-terms": rendererUserTerminology,
  },
};
const baseRules = {
  "renderer-terminology/no-internal-user-terms": "error",
};
const ruleConfig = [
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tsParser,
    },
    plugins: {
      "renderer-terminology": plugin,
    },
    rules: baseRules,
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".vue"],
      },
    },
    plugins: {
      "renderer-terminology": plugin,
    },
    rules: baseRules,
  },
];

function lint(code, filename) {
  return linter.verify(code, ruleConfig, { filename });
}

function expectValid(code, filename) {
  expect(lint(code, filename)).toEqual([]);
}

function expectTerms(code, filename) {
  return lint(code, filename)
    .filter((message) => message.messageId === "internalUserTerm")
    .map((message) => message.message);
}

describe("renderer user terminology", () => {
  it("rejects internal terms in Vue text and user-facing attributes", () => {
    const messages = expectTerms(
      `<template>
        <section>
          <h1>Folder Workspace</h1>
          <Notice title="Collection Workspace unavailable" />
        </section>
      </template>`,
      "src/renderer/src/components/Example.vue"
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain("Folder Workspace");
    expect(messages[1]).toContain("Collection Workspace");
  });

  it("rejects standalone internal names in script copy", () => {
    const messages = expectTerms(
      `const toast = { title: "Folder unavailable", description: \`Collection could not open\` };`,
      "src/renderer/src/components/example.ts"
    );

    expect(messages).toHaveLength(2);
  });

  it("allows internal identifiers, lowercase enum values and data attributes", () => {
    expectValid(
      `<script setup lang="ts">
        const activeFolder = { kind: "folder", Folder: true };
      </script>
      <template><div data-workspace-kind="Folder" /></template>`,
      "src/renderer/src/components/Example.vue"
    );
  });

  it("allows an explicitly documented non-user protocol string", () => {
    expectValid(
      `// eslint-disable-next-line renderer-terminology/no-internal-user-terms -- Agent-facing descriptor 必须保留内部 identity。
      const descriptor = "Folder Workspace";`,
      "src/renderer/src/integration/agent-descriptor.ts"
    );
  });
});
