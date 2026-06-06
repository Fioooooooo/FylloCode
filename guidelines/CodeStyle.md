---
name: CodeStyle
description: FylloCode 的格式化、命名、导入、注释、样式与生成文件约束
keywords: [code-style, prettier, eslint, naming, tailwind]
---

# CodeStyle

## Purpose

定义 FylloCode 中代码风格、命名、格式化、静态检查、注释、样式和生成文件的约束。任何涉及 TypeScript、Vue、Tailwind、目录命名、错误处理和提交前格式化行为的工作，都必须先阅读本文档。

## Applicability

- 适用于 `*.ts`、`*.mts`、`*.vue`、`*.json`、`*.md`、`*.html`、`*.css`。
- 适用于 `src/main/`、`src/preload/`、`src/renderer/`、`src/shared/`、`src/mcp-servers/`、`test/`、`scripts/`。
- 不覆盖主进程/渲染进程的架构职责划分；见 `MainProcess.md` 和 `RendererProcess.md`。

## Sources of Truth

- `package.json`
- `.prettierrc`
- `.editorconfig`
- `eslint.config.mjs`
- `src/renderer/.eslintrc-auto-import.json`（生成物，dev 后生成）
- `src/renderer/src/typed-router.d.ts`
- `src/renderer/auto-imports.d.ts`
- `src/renderer/components.d.ts`
- `src/renderer/src/main.ts`
- `src/renderer/src/components/**`

## Rules

- MUST: 使用 pnpm 作为包管理器，使用 Prettier 和 ESLint 作为仓库默认格式化与静态检查工具。
- MUST: 遵守 `.prettierrc` 与 `.editorconfig` 的统一格式：2 空格缩进、LF、UTF-8、保留分号、双引号、100 列行宽、对象括号内空格、函数参数允许 ES5 trailing comma。
- MUST: 让 `eslint.config.mjs` 对 `**/*.{ts,mts,tsx,vue}` 源文件启用 TypeScript type-checked 规则集，并通过 project service 接通仓库 tsconfig 上下文；不要把生成文件或构建产物纳入类型感知 lint 来凑检查范围。
- MUST: 让 `simple-git-hooks` + `lint-staged` 继续作为 pre-commit 防线；任何新增文件类型若需要自动格式化，应先更新仓库配置再写入 guideline。
- MUST: 在 Vue 文件中使用 `<script setup lang="ts">`；缺少 `lang="ts"` 会被 ESLint 拦截。
- MUST: 使用 kebab-case 命名目录和非组件 TypeScript 文件，使用 PascalCase 命名 Vue 组件文件。
- MUST: 将类型、类、枚举命名为 PascalCase，将变量、函数、store action 命名为 camelCase。
- MUST: 让 IPC channel 字符串遵循 `domain:action` 命名，并通过共享常量集中维护，而不是分散硬编码。
- MUST: 启动外部进程时使用 `cross-spawn`，不得从 `child_process` / `node:child_process` 直接导入 `spawn` 或 `spawnSync`；需要 Node 子进程类型时使用 `import type`。
- MUST: 对自动生成文件保持只读，不手动修改 `src/renderer/auto-imports.d.ts`、`src/renderer/components.d.ts`、`src/renderer/.eslintrc-auto-import.json`、`src/renderer/src/typed-router.d.ts`、`out/`、`dist/`。
- MUST: 在渲染层使用 Tailwind utility classes 和 `@nuxt/ui` 主题 token，避免散落的独立 CSS 文件和硬编码颜色值。
- MUST: 让注释服务于非显然约束、边界和历史原因，不写重复代码字面意思的噪音注释。
- MUST: FylloCode 主动声明的持久化字段 key（在 TypeScript 类型中显式定义、由 FylloCode 代码写入 JSON 文件的字段）SHALL 使用驼峰命名（camelCase）；ACP agent 返回值的内部结构（如 `available_commands` 数组内部字段）不受此约束，按原样存储。
- SHOULD: 在 TypeScript 中优先使用 `type`，避免不必要的 `interface` 和 `any`；若必须接收未知输入，用 `unknown` 加类型守卫。
- SHOULD: 为不明显的函数返回类型显式标注返回值。
- MAY: 在 `assets/main.css` 中维护少量全局 CSS 变量或 `@apply` 组合，但不要把业务样式扩散回传统样式表模式。

## Examples

- Good: `src/renderer/src/components/settings/SettingsAgents.vue` 使用 PascalCase 文件名，脚本块为 `<script setup lang="ts">`。
- Good: `src/main/services/chat/chat-service.ts` 这类非组件文件使用 kebab-case。
- Good: 图标通过 `i-lucide-<name>` 和 `<UIcon />` 使用，图标集合在 `src/renderer/src/config/auto-icon.ts` 中统一注册。
- Bad: 手动修改 `src/renderer/src/typed-router.d.ts` 解决冲突。
- Bad: 在 Vue 模板或组件脚本中硬编码 `#hex` 颜色，绕过 `@nuxt/ui`/Tailwind token。

## Verification

- `pnpm lint`
- `pnpm format`
- `pnpm typecheck`
- `pnpm lint` 必须能够在 TypeScript/Vue 源文件的类型感知规则下通过；若修改 `eslint.config.mjs`、tsconfig 或自动生成类型声明范围，应优先运行此命令确认 project service 仍可解析目标文件。
- 若改动涉及 Vue/TS 规范、自动导入 globals 或路由生成文件，运行 `pnpm dev` 以验证生成物链路正常。
- 提交前检查是否误修改了生成文件或构建产物。

## Maintenance

- 当 Prettier、ESLint、EditorConfig、自动导入、Tailwind、图标体系或命名约定变化时，必须更新本文档。
- 当仓库新增新的生成文件、格式化阶段或 pre-commit 规则时，必须同步更新 Rules 与 Verification。
- 若某个目录因历史原因暂时偏离规范，应在本文档中明确例外来源，避免把例外误写成默认规则。
