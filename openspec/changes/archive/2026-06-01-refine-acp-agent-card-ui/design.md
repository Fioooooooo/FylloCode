## Context

FylloCode 有三个组件渲染 ACP Agent 卡片，定位不同：

- `frontend/src/components/chat/empty/InstalledAgentTile.vue`：Chat 空态首屏 128×128 方形 tile，即点即切换（`setDraftAgent`）。本次不改。
- `frontend/src/components/chat/empty/AgentPickerCard.vue`：Chat 空态弹窗内的横向卡片，轻量入口，仅「选中 / 安装 / 重试」，无更新无卸载。
- `frontend/src/components/settings/AgentCard.vue`：设置页完整管理卡，承载安装 / 更新 / 卸载 / 接管 + 两个确认 modal。

后两者视觉骨架（图标 + 名称行 + `AgentKindBadge` + 元数据 + 描述）高度重叠却各写一套，已出现不一致：图标 `w-9`(picker) vs `w-8`(settings)、内边距 `p-3` vs `p-4`、元数据排版各异。

设置页 `AgentCard` 右侧操作区是一条互斥状态链（`v-if/v-else-if`）：①处理中（0 按钮）②出错（重试）③可更新（更新 + 卸载，**2 个按钮**）④已安装（徽章 + 卸载）⑤未安装（安装）。状态③的双按钮与 `grid-cols-2`（`SettingsAgents.vue:107`）窄卡叠加，导致状态切换时卡片宽度抖动。

约束来源（已核对）：

- `agent-status-panel/spec.md:11` 规定卡片含「名称下方版本号与 license」「右侧根据安装状态展示对应操作区域」——本次 MODIFIED。
- `agent-install/spec.md:104`「卸载入口可见性」措辞为「卸载按钮」——本次 MODIFIED 放宽为「操作项」。
- `agent-install` 的「卸载二次确认对话框」`(managedBy, installMethod)` 文案矩阵是硬约束——本次**不动**，kebab 菜单项点击后照常弹原 modal。
- `chat-agent-selection/spec.md:84`、`acp-agent-kind-classification/spec.md:104` 规定徽章共享与呈现——本次**不动**。

## Goals / Non-Goals

**Goals:**

- 抽出纯展示组件 `AgentCardBase`，消除 picker 卡与 settings 卡的视觉骨架不一致。
- 设置页操作区：主操作常驻、卸载收进 kebab、操作区定宽，消除状态③抖动。
- 设置页信息层级：抬升 name，以 website→repository 外链图标替换 license/authors。
- `AcpAgentEntry` 补 `website?: string`。

**Non-Goals:**

- 不改 Chat 空态首屏 `InstalledAgentTile` 的任何行为或样式。
- 不给 Chat 弹窗 `AgentPickerCard` 增加外链入口（弹窗是轻量装机入口，决策深度浅）。
- 不改卸载二次确认对话框文案矩阵。
- 不改分类徽章呈现层级（不引入「常驻分类文案」）。
- 不引入 bridge 前置依赖的结构化数据或真引导（`AcpFylloMeta` 仅 `kind`，前置依赖由 agent 自身运行时检测与指引承担）。
- 不新增 `openExternal` IPC（见决策 3）。

## Decisions

### 决策 1：展示基座 + 两个交互外壳，而非「一个组件两 variant」

新增 `frontend/src/components/acp/AgentCardBase.vue` 作为**纯展示、零交互**基座：渲染图标、名称行（含 `AgentKindBadge` 槽位）、版本号、描述，并暴露 `#meta`（名称行下方的元数据/外链区）与 `#actions`（右侧操作区）两个具名插槽。`AgentPickerCard.vue` 与 `AgentCard.vue` 保留各自文件，改为消费 `AgentCardBase`，把各自的选中态 / 操作区 / 外链塞进插槽。

**为什么不做单组件多 variant**：两卡交互模型不同——picker 卡有 `selected/selectable` 且点卡片体 `emit('select')`，settings 卡无选中态、承载 4 条操作 + 2 个 modal。塞进一个组件会让 props 膨胀成两套互斥集合（`selectable` 对 settings 无意义，`userDataPath/uninstall` 对 picker 无意义），也更难保证 `AgentPickerCard`「轻量、无更新无卸载」的 spec 约束不被 settings 分支污染。共享视觉骨架、独立交互契约，是更可控的粒度。

`AgentCardBase` 统一：图标尺寸（取 `w-9 h-9`）、内边距、名称行排版。由于两卡原先一个用 `div` 一个用 `UCard`，基座统一用 `div + rounded-lg + border`，settings 卡外层是否保留 `UCard` 由实现决定，但内部骨架走基座。

### 决策 2：卸载收进 `UDropdownMenu` kebab，操作区定宽

复用项目既有 `UDropdownMenu`（范例 `frontend/src/components/chat/SessionItem.vue:135` 的 kebab 菜单项模式）。设置页 `AgentCard` 操作区改为「主操作 + kebab(`...`)」两段式：

- 主操作随状态变化常驻：安装 / 更新 / 重试 / 「已安装」success 徽章，任一时刻至多一个。
- kebab 菜单仅在 `installed === true` 时渲染，内含「卸载」菜单项；点击仍调用现有 `requestUninstall()` → 弹原 `(managedBy, installMethod)` modal。
- 菜单项的并发禁用沿用现有 `actionDisabled`，禁用时 tooltip「其他 Agent 正在处理中」。
- 操作区容器给固定最小宽度，使各状态宽度一致，消除状态③双按钮抖动（根因）。

**为什么 kebab 而非「定宽常驻双按钮」**：用户已说明未来可能给已安装 agent 增加「设置 auth methods」等管理项（优先级低）。kebab 是可扩展容器，未来新管理项作为新菜单项加入即可，卡片右侧恒为「主操作 + `...`」，宽度不随管理功能增多而变。本次只立起容器 + 放入「卸载」，auth 设置不在范围内。

### 决策 3：外链用 `<a target="_blank">`，复用既有 window-open handler，不新增 IPC

渲染进程不能直接调 `shell`。项目既有机制：`electron/main/bootstrap/window.ts:162` 的 `setWindowOpenHandler` 拦截所有 `target="_blank"` 链接 → `shell.openExternal(details.url)` 并 `return { action: "deny" }`（阻止应用内导航/新窗口）。既有范例 `frontend/src/components/task/TaskCard.vue:92-104` 即 `UButton as="a" :href target="_blank"` + `i-lucide-external-link`。

设置页 `AgentCard` 外链入口照此实现：紧凑图标按钮，`as="a"`、`:href="agent.website ?? agent.repository"`、`target="_blank"`、`rel="noreferrer"`，仅当二者皆存在时渲染。**无需新增 IPC**。点击 `<a>` 时阻止冒泡，避免触发卡片体可能的点击行为（settings 卡片体本无点击行为，但仍加 `.stop` 防御）。

### 决策 4：`AcpAgentEntry` 增加 `website?: string`

registry 原始 JSON（`data/acp/registry-cache.json`）约 28/36 个 agent 已含 `website`，但 `shared/types/acp-agent.ts:33-44` 的 `AcpAgentEntry` 仅有 `repository?`。补 `website?: string` 即可，registry 注入链路（`agent-registry-cache`）透传未知字段，无需改数据出口逻辑——实现阶段需确认注入未做字段白名单过滤。

## Risks / Trade-offs

- [基座抽取可能回归 picker 卡视觉] → `AgentPickerCard` 已被 `chat-agent-selection`/`acp-agent-kind-classification` spec 约束（无更新无卸载、徽章呈现），重构后须跑 `frontend/src/__tests__/components/agent-card.spec.ts` 与相关测试，确认 picker 卡行为不变。
- [外链字段缺失] → website/repository 皆可能缺失；spec 已规定两者皆无时不渲染入口，实现用 `v-if` 守卫。
- [registry 注入若有字段白名单] → 若注入处过滤未知字段会导致 `website` 丢失；实现阶段在 `agent-registry-cache` 注入处确认透传，必要时显式保留 `website`。
- [kebab 可发现性低于常驻按钮] → 卸载是低频操作，收纳可接受；通过 `...` 图标 + 菜单项文案「卸载」保证可达。

## Migration Plan

纯前端 UI + 一个可选类型字段，无数据迁移、无 IPC 变更。按 tasks.md 顺序实现，以现有组件测试为回归基线。回滚即还原组件文件与类型字段。

## Open Questions

无。实现细节（settings 卡外层是否保留 `UCard`、操作区最小宽度具体取值）留给 Apply 阶段按视觉效果定。
