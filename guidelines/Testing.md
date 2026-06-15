---
name: Testing
description: FylloCode 的测试目录、运行环境、mock 约定与最小验证要求
keywords: [testing, vitest, happy-dom, mocks, verification]
---

# Testing

## Purpose

定义 FylloCode 的测试框架、测试目录约定、mock/fixture 规则，以及不同类型改动至少要跑哪些验证命令。任何涉及新增测试、修改测试结构、引入新的测试环境或提交代码前的验证判断，都必须先阅读本文档。

## Applicability

- 适用于 `vitest.config.mts`、`test/renderer/src/`、`test/main/`、`test/preload/`、`test/shared/`、`test/mcp-servers/**`。
- 适用于使用 Vitest、`@vue/test-utils`、`happy-dom` 和 Node 测试环境的代码。
- 不覆盖业务行为应该是什么；行为断言以对应 OpenSpec 为准。

## Sources of Truth

- `vitest.config.mts`
- `package.json`
- `test/renderer/src/setup.ts`
- `test/main/setup.ts`
- `test/renderer/src/**`
- `test/main/**`
- `test/shared/**`
- `test/mcp-servers/fyllo-specs/**`
- `test/mcp-servers/fyllo-cortex/**`

## Rules

- MUST: 使用 Vitest 作为测试运行器，并维持 `renderer` 与 `main` 两个测试 project 的分离。
- MUST: 将测试文件放在根目录 `test/` 下，不与生产代码并置，不散落在源码目录边上。
- MUST: 按 `src/` 目录镜像组织测试子目录，保证从实现路径可以快速定位到测试路径。
- MUST: 在 renderer 测试中使用 `happy-dom` 环境，并通过 `test/renderer/src/setup.ts` 集中处理 `@nuxt/ui` 组件 stub 和全局 mock。
- MUST: 对基于 `useConfirmDialog()` 的简单确认流程，优先 mock composable 返回的 `Promise<boolean>` 并断言业务分支，不要在普通组件测试里耦合 `useOverlay()` 内部状态或全局 overlay 容器实现。
- MUST: 在 main 测试中通过 `test/main/setup.ts` mock `electron`、`@electron-toolkit/utils` 和 `electron-log/main`，避免依赖真实 Electron 进程。
- MUST: 优先 mock `src/renderer/src/api/*` 这一层，而不是在组件/store 测试里直接 mock 底层 IPC 细节。
- MUST: 对涉及文件系统写入的主进程测试使用可隔离的临时目录，不要硬编码 `/private/tmp`、`/var` 等环境敏感路径。
- MUST: 让 `vitest.config.mts` 中的 aggregate coverage threshold 保持非零；当前最低线基于实测覆盖率设置为 statements 50、branches 40、functions 50、lines 50，`pnpm test:coverage` 低于任一阈值必须失败。
- MUST: 让改动规模与验证规模匹配；修改主进程 IPC、共享类型、storage、bootstrap 等基础设施时，不能只跑单个组件测试。
- SHOULD: 为 store、service、domain、ipc kit 这类逻辑集中层提供直接单元测试，而不是只通过高层 UI 间接覆盖。
- SHOULD: 让新增的 `@nuxt/ui` 组件 stub 保留关键交互行为；纯展示壳组件可直接 stub 为 `true`。
- SHOULD: 对 `UModal` / overlay 类组件的 stub 同时兼容显式 `:open` 和 overlay 场景下未传 `open` 的渲染方式，否则 `ConfirmDialog` 这类基于 `useOverlay` 的组件测试会误判为空。
- MAY: 在单个测试文件中使用 `vi.useFakeTimers()` 控制定时器，但必须在该文件内正确恢复。

## Examples

- Good: renderer 组件测试放在 `test/renderer/src/components/`，store 测试放在 `test/renderer/src/stores/`。
- Good: `test/main/ipc/_kit/` 用来验证 `wrap-handler`、`stream-channel`、schema 校验和错误归一化。
- Good: `test/mcp-servers/fyllo-specs/` 与 `test/mcp-servers/fyllo-cortex/` 归入 main project 测试环境。
- Good: `test/renderer/src/components/task-card.spec.ts` mock `useConfirmDialog()`，只断言“点击删除后是否发起确认、确认后是否 emit 删除事件”。
- Bad: 在 Vue 组件测试里直接 mock `ipcRenderer.invoke(...)` 而绕过 `src/renderer/src/api/*`。
- Bad: 改了 `src/shared/types/ipc.ts` 或 storage 格式后，只跑一个前端快照测试就提交。
- Bad: 为简单确认弹窗专门在每个组件测试里搭一套 overlay provider，再去断言 modal 内部 DOM 细节。

## Verification

- 文档或纯注释改动：通常不要求跑测试，但若同步修改了示例代码或命令，需要至少检查对应路径与命令仍然存在。
- 前端组件、页面、composable、store 改动：`pnpm vitest run test/renderer/src/**/*.{test,spec}.{ts,vue}`
- 若改动涉及 `ConfirmDialog.vue` 或 `useConfirmDialog.ts`：除通用 renderer 测试外，至少补一条组件级测试验证 close resolve 分支，以及一条调用方测试验证确认/取消分支。
- 主进程 service/domain/infra/ipc/preload 改动：`pnpm vitest run test/main/**/*.{test,spec}.ts`
- 共享类型、共享 schema、错误码、MCP server 改动：`pnpm vitest run test/main/**/*.{test,spec}.ts` 和 `pnpm vitest run test/shared/**/*.{test,spec}.ts`
- 全量提交前的标准检查：`pnpm test`
- 覆盖率检查：`pnpm test:coverage`。该命令生成 text/html coverage 报告，并按 `vitest.config.mts` 的 aggregate threshold 阻断低覆盖率提交；调整阈值前应先记录当前仓库实测 coverage，避免把阈值设到当前测试无法通过的水平。

## Maintenance

- 当测试运行器、测试环境、coverage 配置、setup 文件、mock 约定或目录结构变化时，必须更新本文档。
- 当新增一类仓库代码需要独立测试树或独立运行环境时，应同步补充 Applicability、Rules 和 Verification。
- 若 `vitest.config.mts` 与本文档描述冲突，以配置文件和实际测试路径为准，并及时修正文档。
