# 实现任务

> 范围依据：`proposal.md`、`design.md`、`specs/agent-status-panel/spec.md`、`specs/agent-install/spec.md`。
> 不改动：`InstalledAgentTile.vue`、`MoreAgentsTile.vue`、`AgentKindBadge.vue`、卸载确认 modal 文案矩阵、分类徽章呈现规则。

## 1. 共享类型

- [x] 1.1 在 `shared/types/acp-agent.ts` 的 `AcpAgentEntry` 接口（当前 33-44 行）中，于 `repository?: string` 之后新增可选字段 `website?: string`。验收：`AcpAgentEntry` 可读取 `website`，typecheck 通过。
- [x] 1.2 核对 registry 注入链路是否透传未知字段。检查 `agent-registry-cache` 注入 `__fyllo` 的实现（`electron/main/infra/storage/acp-registry-cache.ts` 及对应 service），确认 `website` 从原始 JSON（`data/acp/registry-cache.json` 已含）能透传到 `AcpAgentEntry`；若存在字段白名单/显式映射导致 `website` 丢失，则显式保留该字段。验收：在设置页能读取到含 `website` 的 agent（如 `gemini`、`cursor`）的该字段。

## 2. 抽取展示基座 AgentCardBase

- [x] 2.1 新增 `frontend/src/components/acp/AgentCardBase.vue`，纯展示、零交互。Props 至少含 `agent: AcpAgentEntry`、`icon?: string`。渲染：左侧图标盒（统一 `w-9 h-9`，沿用现有 `rounded-lg bg-white` + `img`/`i-lucide-terminal` 兜底）、名称行（`agent.name` + `AgentKindBadge :kind="agent.__fyllo?.kind"`）、版本号、描述（`line-clamp-2`）。外层用 `div + rounded-lg border bg-default`。
- [x] 2.2 在 `AgentCardBase` 暴露两个具名插槽：`#meta`（名称行下方的元数据/外链区）与 `#actions`（右侧操作区）。验收：父组件可通过插槽注入内容，基座本身不含任何按钮/选中态/事件。
- [x] 2.3 基座统一图标尺寸为 `w-9 h-9`、内边距与名称行排版，消除原 picker(`w-9`/`p-3`) 与 settings(`w-8`/`p-4`) 的差异。验收：两卡复用基座后图标尺寸、padding 一致。

## 3. 改造 Chat 弹窗 AgentPickerCard（消费基座）

- [x] 3.1 重构 `frontend/src/components/chat/empty/AgentPickerCard.vue` 改为消费 `AgentCardBase`：骨架交给基座，将「选中态指示」「安装/重试按钮」「进度文案」放入 `#actions` 插槽，`selected/selectable` 选中态样式（`border-primary` 等）保留在外壳。
- [x] 3.2 保持 `AgentPickerCard` 现有交互契约不变：仅「选中 / 安装 / 重试」，无更新无卸载，**不**新增外链入口（外链仅设置页）。验收：符合 `chat-agent-selection/spec.md:84` 与 `acp-agent-kind-classification/spec.md:104`，picker 卡行为与改造前一致。

## 4. 改造设置页 AgentCard（kebab + 外链 + 信息层级）

- [x] 4.1 重构 `frontend/src/components/settings/AgentCard.vue` 消费 `AgentCardBase`，骨架走基座，操作区进 `#actions`、外链进 `#meta`。保留组件内现有 `requestInstall`/`requestUninstall`/`confirmTakeoverInstall`/`confirmUninstall` 逻辑与两个 `UModal`（接管、卸载）不变。
- [x] 4.2 操作区改为「主操作 + kebab」两段式：主操作（安装/更新/重试/「已安装」success 徽章）常驻，任一时刻至多一个；操作区容器设固定最小宽度，使各安装状态下卡片宽度一致，消除「可更新」状态双按钮抖动。验收：在 ②出错/③可更新/④已安装/⑤未安装 间切换时卡片宽度不跳动。
- [x] 4.3 用 `UDropdownMenu` 实现 kebab(`...`) 菜单（参考 `frontend/src/components/chat/SessionItem.vue:135` 模式），仅在 `agentStatus?.installed === true` 时渲染，菜单含「卸载」项，点击调用现有 `requestUninstall()`（照常弹原 `(managedBy, installMethod)` modal，不改文案矩阵）。菜单项在 `actionDisabled` 为真时禁用并 tooltip「其他 Agent 正在处理中」。验收：满足 `specs/agent-install/spec.md` 三个 scenario。
- [x] 4.4 信息层级调整：抬升 `name` 视觉权重（高于其余文本）；**移除**常驻的 `license`（当前 131 行）与 `authors`（当前 212 行）文本展示。验收：卡片不再显示 license/authors 文本。
- [x] 4.5 在 `#meta` 区新增外链图标入口：`UButton as="a"` + `icon="i-lucide-external-link"` + `:href="agent.website ?? agent.repository"` + `target="_blank"` + `rel="noreferrer"`，参考 `frontend/src/components/task/TaskCard.vue:92-104` 模式；`v-if="agent.website || agent.repository"` 守卫，二者皆无则不渲染。给 `<a>` 点击加 `.stop` 防御冒泡。验收：满足 `specs/agent-status-panel` 外链三个 scenario；点击经主进程 `setWindowOpenHandler`（`electron/main/bootstrap/window.ts:162`）走 `shell.openExternal`，不在应用内导航。

## 5. 测试

- [x] 5.1 更新 `frontend/src/__tests__/components/agent-card.spec.ts`：覆盖 kebab 菜单中的卸载入口（已安装时可见、未安装时不渲染、并发时禁用）、外链渲染（website 优先 / 回退 repository / 皆无不渲染）、license/authors 不再展示。沿用 `frontend/src/__tests__/setup.ts:44` 的 `UDropdownMenu` stub。
- [x] 5.2 若 `AgentPickerCard` 有对应测试，补充/调整以验证消费基座后行为不变（无更新无卸载、选中态、安装/重试）。验收：`pnpm test` 全绿。

## 6. 项目规范

- [x] 6.1 在 `guidelines/RendererProcess.md` 增补「渲染进程打开外部链接」约定：标准方式为 `<a target="_blank" rel="noreferrer">`（或 `UButton as="a"`），由主进程 `setWindowOpenHandler`（`electron/main/bootstrap/window.ts`）统一转交 `shell.openExternal` 并 deny 应用内导航；渲染进程不直接引用 `shell`，无需为外链新增 IPC。验收：guideline 中可检索到该约定。

## 7. 验证

- [x] 7.1 运行 `pnpm typecheck`、`pnpm lint`、`pnpm test`，全部通过。
- [x] 7.2 启动 `pnpm dev` 人工核对：设置页卡片在各安装状态下宽度稳定、卸载在 kebab 菜单内、外链图标可点击打开浏览器、license/authors 已移除、name 更突出；Chat 弹窗 `AgentPickerCard` 外观与行为无回归。
