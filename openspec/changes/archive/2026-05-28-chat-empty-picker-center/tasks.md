## 1. 调整 ChatEmptyAgentPicker 布局

- [x] 1.1 修改 `frontend/src/components/chat/empty/ChatEmptyAgentPicker.vue` 的 `v-if="hasInstalled"` 分支：- 移除 `class="grid grid-cols-2 gap-3 sm:grid-cols-5"`。- 改为 `<div class="flex justify-center items-center gap-3">`，子卡片宽高由 `InstalledAgentTile`（`aspect-square`）和 `MoreAgentsTile variant="more"`（`aspect-square`）自身决定。- 容器内 `v-for InstalledAgentTile` 与末尾 `MoreAgentsTile variant="more"` 顺序、props 不变。- 不修改 `visibleInstalled` 计算属性（仍取 `installedAgentIds.slice(0, MAX_VISIBLE_INSTALLED)`）。- 验收：N=1/2/3/4 时整组卡片横向居中，所有卡片高度一致。

- [x] 1.2 修改 `frontend/src/components/chat/empty/ChatEmptyAgentPicker.vue` 的 `v-else` 分支（无已安装）：- 移除 `class="grid grid-cols-1 gap-3 sm:grid-cols-2"` 与 `MoreAgentsTile` 上的 `class="sm:col-span-2"`。- 改为外层 `<div class="flex justify-center">`，内层 `<div class="w-full max-w-sm">` 包裹 `<MoreAgentsTile variant="promo" :total-count="totalAgents" @click="openModal" />`。- `MoreAgentsTile.vue` 自身 promo 变体已是 `w-full`，不需修改子组件。- 验收：promo 卡可视宽度收敛到 `max-w-sm`（约 24rem），整体水平居中，文案与 totalCount 维持。

- [x] 1.3 不修改 `frontend/src/components/chat/empty/InstalledAgentTile.vue` 与 `frontend/src/components/chat/empty/MoreAgentsTile.vue`，确认 props/样式契约保持不变。

## 2. 同步 OpenSpec 文档

- [x] 2.1 不在 Apply 阶段直接修改 `openspec/specs/chat-interface/spec.md`；本次提案 `specs/chat-interface/spec.md` 中 `## MODIFIED Requirements` 已给出新版本，归档阶段（archive-change）会自动同步到 `openspec/specs`。
- [x] 2.2 不改动相邻的「InstalledAgentTile 即点即生效」、「MoreAgentsTile 打开 AgentPickerModal」、「AgentPickerModal 支持搜索、安装、选择」三个 requirement。
- [x] 2.3 评估是否需要在 `guidelines/` 下登记一条空态布局约束；当前结论为否（约束足够局部，spec 已覆盖），如评估结论改变则补充新增/修改的 guideline 文件名与变更点。

## 3. 验证

- [x] 3.1 `pnpm typecheck` 通过（确保 `:style` 内联绑定的 TypeScript 类型推导无报错）。
- [x] 3.2 `pnpm lint` 通过。
- [x] 3.3 `pnpm test` 通过；`frontend/src/__tests__/components/more-agents-tile.spec.ts` 已更新：根元素由 `button` 改为 `div`，`more` 变体断言从 `aspect-square` 改为 `w-32 h-32`，与 `MoreAgentsTile.vue` 实际改动保持一致。
- [ ] 3.4 手动验证（开发模式 `pnpm dev`）：- N=0 时 promo 卡宽度受限并居中。- N=1 / 2 / 3 时 N+1 张卡片整组居中，所有卡片高度一致。- N=4 时 5 张卡片整组居中，视觉与原 5 列布局一致或更紧凑。- 切换草稿态 / 已建空 session / 已发消息后切回 / 安装新 agent 等流程时，布局随 `installedAgentIds.length` 平滑更新。
