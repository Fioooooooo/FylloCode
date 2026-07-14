import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import rendererFeatureBoundaries from "../../../scripts/eslint-rules/renderer-feature-boundaries.mjs";

const linter = new Linter();
const ruleConfig = [
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "renderer-features": {
        rules: {
          boundaries: rendererFeatureBoundaries,
        },
      },
    },
    rules: {
      "renderer-features/boundaries": "error",
    },
  },
];

function lint(code, filename) {
  return linter.verify(code, ruleConfig, { filename });
}

function expectValid(code, filename) {
  expect(lint(code, filename)).toEqual([]);
}

function expectViolation(code, filename, messageId) {
  expect(lint(code, filename).map((message) => message.messageId)).toContain(messageId);
}

describe("renderer feature boundaries", () => {
  it("allows inward dependencies inside one feature", () => {
    expectValid(
      'import { selectState } from "../model/selectors";',
      "src/renderer/src/features/example/application/controller.ts"
    );
    expectValid(
      'import { createController } from "../application/controller";',
      "src/renderer/src/features/example/ui/ExampleView.ts"
    );
    expectValid(
      'import ExampleView from "../ui/ExampleView";',
      "src/renderer/src/features/example/integration/host.ts"
    );
  });

  it("allows feature consumers to use public entry points", () => {
    expectValid(
      'import { openExample } from "@renderer/features/example";',
      "src/renderer/src/pages/example.ts"
    );
    expectValid(
      'import { registerExample } from "@renderer/features/example/integration";',
      "src/renderer/src/pages/example.ts"
    );
  });

  it("rejects internal and relative imports from feature consumers", () => {
    expectViolation(
      'import { selectState } from "@renderer/features/example/model/selectors";',
      "src/renderer/src/pages/example.ts",
      "deepFeatureImport"
    );
    expectViolation(
      'import { selectState } from "../features/example/model/selectors";',
      "src/renderer/src/pages/example.ts",
      "deepFeatureImport"
    );
  });

  it("keeps model modules framework-free and inward-only", () => {
    expectValid(
      'import { toPending } from "./pending";',
      "src/renderer/src/features/example/model/selectors.ts"
    );
    expectValid(
      'import { ipcResponseSchema } from "../../../../../shared/types/ipc";',
      "src/renderer/src/features/example/model/selectors.ts"
    );
    expectViolation(
      'import { computed } from "vue";',
      "src/renderer/src/features/example/model/selectors.ts",
      "modelDependency"
    );
    expectViolation(
      'import { useChatStore } from "../../../stores";',
      "src/renderer/src/features/example/model/selectors.ts",
      "modelDependency"
    );
    expectViolation(
      'import { chatApi } from "../../../api/session/chat";',
      "src/renderer/src/features/example/model/selectors.ts",
      "modelDependency"
    );
    expectViolation(
      'import { formatLabel } from "../../../utils/chat-prompt";',
      "src/renderer/src/features/example/model/selectors.ts",
      "modelDependency"
    );
    expectViolation(
      'import { run } from "../application/controller";',
      "src/renderer/src/features/example/model/selectors.ts",
      "invalidLayerDependency"
    );
    expectViolation(
      'import { query } from "@renderer/features/other";',
      "src/renderer/src/features/example/model/selectors.ts",
      "crossFeatureDependency"
    );
  });

  it("keeps application modules independent from UI and other features", () => {
    expectViolation(
      'import ExampleView from "../ui/ExampleView.vue";',
      "src/renderer/src/features/example/application/controller.ts",
      "applicationUiDependency"
    );
    expectViolation(
      'import { openOther } from "@renderer/features/other";',
      "src/renderer/src/features/example/application/controller.ts",
      "crossFeatureDependency"
    );
  });

  it("keeps UI away from renderer API wrappers and integration entries", () => {
    expectViolation(
      'import { api } from "@renderer/api/session/chat";',
      "src/renderer/src/features/example/ui/ExampleView.ts",
      "uiApiDependency"
    );
    expectViolation(
      'import { registerOther } from "@renderer/features/other/integration";',
      "src/renderer/src/features/example/ui/ExampleView.ts",
      "integrationFromUi"
    );
  });

  it("rejects relative cross-feature imports from integration modules", () => {
    expectViolation(
      'import { createOther } from "../../other/integration/host";',
      "src/renderer/src/features/example/integration/host.ts",
      "deepFeatureImport"
    );
  });

  it("rejects self-imports through the public API", () => {
    expectViolation(
      'import { selectState } from "@renderer/features/example";',
      "src/renderer/src/features/example/ui/ExampleView.ts",
      "selfPublicImport"
    );
  });

  it("requires explicit exports from public entry points", () => {
    expectViolation(
      'export * from "./ui/ExampleView";',
      "src/renderer/src/features/example/index.ts",
      "wildcardPublicApi"
    );
    expectViolation(
      'export * from "./host";',
      "src/renderer/src/features/example/integration/index.ts",
      "wildcardPublicApi"
    );
  });
});
