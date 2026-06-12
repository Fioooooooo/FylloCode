## 1. 移除 ActivityBar 提案入口

- [x] 1.1 在 `src/renderer/src/config/activity-bar.ts` 的 `activityBarItems` 数组中删除 `id: "proposal"` 条目（icon `i-lucide-file-pen`、label「提案」、path `/proposal`）。保留其余所有条目及 `isDefault: true` 的 overview 条目。验收：`activityBarItems` 不再含 path 为 `/proposal` 的条目；`defaultActivityBarItem` 仍为 overview。
- [x] 1.2 更新 `test/renderer/src/config/activity-bar.spec.ts`：补充断言 `activityBarItems.some((i) => i.path === "/proposal")` 为 `false`。保持现有「唯一 default / 唯一 id / 唯一 path / default 为 /overview」断言通过。
- [x] 1.3 检查并更新 `test/renderer/src/components/activity-bar.spec.ts`：若存在对「提案」入口渲染的断言，移除或改为断言不渲染该入口。验收：测试反映主导航不含提案入口。

## 2. 概览页归档卡入口

- [x] 2.1 修改 `src/renderer/src/components/overview/OverviewStatsBar.vue`：仅将 `cards` 中 `key: "archives"` 的卡片渲染为可点击元素，点击调用 `router.push("/proposal")`。引入 `useRouter`（参考 `OverviewActiveChanges.vue` 的 `router.push` 用法）。其余三张卡（`specs`/`guidelines`/`lineages`）保持纯展示 `div`，不加交互。
- [x] 2.2 为可点击的归档卡提供与 `OverviewActiveChanges.vue` 卡片一致的 hover 反馈（`hover:bg-accented` 风格）与无障碍语义（可聚焦、键盘可触发，如使用 `button` 语义或 `role`/`tabindex`/键盘事件）。为该卡补充稳定的测试标识（如 `data-test="overview-archives-card"`）。验收：归档卡点击/键盘触发均跳转 `/proposal`。
- [x] 2.3 在 `test/renderer/src/pages/overview.spec.ts` 中新增用例：mock router，断言点击归档卡触发 `router.push("/proposal")`；断言点击其余三张统计卡不触发跳转。

## 3. 详情页返回行为

- [x] 3.1 修改 `src/renderer/src/pages/proposal/[id].vue` 的 `backToList()`：将硬编码 `router.push("/proposal")` 改为——存在可回退历史时 `router.back()`，否则 `router.replace("/overview")`。无历史判定使用 `router.options.history.state.back == null`（参考 vue-router history state）。函数名可保留 `backToList` 或重命名为 `goBack`，`ProposalDetailHeader` 的 `@back` 绑定需同步。
- [x] 3.2 更新或新增详情页返回行为测试（基于 `test/renderer/src/components/proposal-detail-header.spec.ts` 或为 `[id].vue` 新增页面级测试）：用例一，存在 `history.state.back` 时点击返回调用 `router.back()`；用例二，无 `history.state.back` 时点击返回跳转 `/overview`。验收：两条路径均有断言覆盖。

## 4. 文档与验证

- [x] 4.1 评估是否需要更新本地仓库 guidelines：若 `guidelines/RendererProcess.md` 记录了 ActivityBar 注册表条目清单或导航入口约定，同步移除提案入口描述；若无相关记录则跳过并在实现说明中注明。
- [x] 4.2 运行 `pnpm typecheck`、`pnpm lint`、`pnpm test`，确保三处改动相关测试全部通过、无类型与 lint 报错。验收：全部命令通过。
