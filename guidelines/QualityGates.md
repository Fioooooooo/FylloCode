---
name: Quality Gates
description: Governs the project's type checking, linting, formatting, hooks, and CI quality commands.
keywords: [quality, lint, typecheck, format, ci, hooks]
---

# Quality Gates

## 范围

- 覆盖：根目录质量脚本、TypeScript 严格性、ESLint/Prettier 配置、git hooks 和 GitHub Actions CI。
- 不覆盖：测试文件位置和 Vitest project 细节；见 `guidelines/Testing.md`。

## 规则

- MUST 使用 pnpm 10+ 和 Node.js 22+ 执行项目命令。证据：`package.json` 的 `engines`、`packageManager` 和 `CONTRIBUTING.md`。
- MUST 使用与 `.nvmrc` 和 `pnpm-lock.yaml` 一致的本地环境执行项目命令；当当前 worktree 环境尚未准备好或需要修复时，使用 `sh scripts/prepare-worktree-env.sh`。该脚本按 `.nvmrc` 切换 Node 版本，并在依赖缺失、锁文件不一致或 `node_modules` 为软链时通过 `pnpm install --frozen-lockfile` 按锁文件安装依赖；具体执行节奏见 `AGENTS.md`。证据：`.nvmrc`、`scripts/prepare-worktree-env.sh`、`AGENTS.md`。
- MUST 通过 `pnpm typecheck` 运行类型检查；该命令委托给 `typecheck:node`（`tsc --noEmit -p tsconfig.node.json --composite false`）和 `typecheck:web`（`vue-tsc --noEmit -p tsconfig.web.json --composite false`）。证据：`package.json`。
- MUST 保持严格 TypeScript 检查。项目从 `@electron-toolkit/tsconfig/tsconfig.json` 继承 `strict: true`，并且 `tsconfig.node.json` 与 `tsconfig.web.json` 都覆盖了 `noImplicitAny: true`；没有 proposal 时不得关闭 strict 子选项。
- MUST 保持 lint 基于已配置的 ESLint flat config。`pnpm lint` 运行 `eslint --cache .`，`eslint.config.mjs` 包含 `@electron-toolkit/eslint-config-ts` 的 `recommendedTypeChecked`、`eslint-plugin-vue` 的 `flat/recommended`、Prettier 兼容配置和本地边界规则。
- MUST 保持 domain-first 边界由 lint 强制：main service 跨 domain 只能导入目标 domain 根级 `_public`，禁止 area 级 `_public` 和 `_public` 中的 `export *`；renderer store 不能导入其他 domain 的 API wrapper，且 store 模块不能导入 root store barrel；renderer 非 store 代码应从 `@renderer/stores` root barrel 导入 store，不能从 `@renderer/stores/<domain>` 深路径导入；renderer 非 API wrapper 代码不能直接调用 `window.api`；main IPC handler 不能直接导入 `fs`、`path` 或 `child_process` 等 infra 细节，显式例外需要写在 `eslint.config.mjs` 中。证据：`eslint.config.mjs`。
- MUST 保持格式化基于 Prettier。`pnpm format` 运行 `prettier --write .`，格式选项位于 `.prettierrc`，排除项位于 `.prettierignore`。
- MUST 通过 `simple-git-hooks` 安装 git hooks。`package.json` 在 `postinstall` 中运行 `simple-git-hooks`，配置 `pre-commit` 调用 `npx lint-staged`，并配置 `commit-msg` 调用 `node scripts/validate-commit-msg.mjs "$1"`。证据：`package.json`、`.git/hooks/pre-commit`、`.git/hooks/commit-msg`。
- MUST 保持 pre-commit 检查有实际意义。`lint-staged` 对 JS/TS/Vue 文件运行 `eslint --cache --fix` 和 `prettier --write`，对 JSON/Markdown/HTML/CSS 运行 `prettier --write`。
- MUST 保持提交信息符合仓库验证格式：header 为 `type(scope): summary`，可选正文必须与 header 之间用空行分隔，并且非空正文行以 `- ` 开头；允许生成式 header：`Merge`、`Revert` 和 `Squashed commit of the following:`。证据：`scripts/validate-commit-msg.mjs`、`test/main/scripts/validate-commit-msg.spec.mjs`。
- MUST 保持 CI 在质量失败时阻塞。`.github/workflows/ci.yml` 在 push 到 `main` 和针对 `main` 的 pull request 时触发，并运行 `pnpm test`、`pnpm lint` 和 `pnpm typecheck`，且不使用 `continue-on-error`。

## 验证

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
```

只有在确实需要格式化改动时才运行 `pnpm format`。

## 失效信号

- 当 `package.json`、任何 `tsconfig*.json`、`eslint.config.mjs`、`.prettierrc`、`.prettierignore`、`.github/workflows/*.yml`、`scripts/prepare-worktree-env.sh`、`scripts/validate-commit-msg.mjs` 或 git hook 工具链发生变化时，重新检查本文档。
