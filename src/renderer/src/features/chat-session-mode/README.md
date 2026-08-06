# Chat Session Mode

该 feature 统一新建 Chat 会话的模式选择与已建立会话的模式标识。

## 状态与范围

- `draftSessionMode` 由 session store 持有，默认值为 `fyllocode`；Session 创建后模式不可修改。
- `model/session-mode-presentation.ts` 是两种模式的 label 与 tooltip 单一来源。
- `ui/SessionModeTabs.vue` 只用于 draft prompt 上方的模式选择。
- `ui/SessionModeBadge.vue` 只用于已建立 Chat Session 的 Header 标识。

## 非范围

- 不在 ChatSidebar、SessionItem 或会话列表中展示模式。
- 不改变 Agent 选择、Session 配置选项、Workspace 授权范围或 Apply/Archive ACP session。

## 宿主与公共入口

- 宿主：`ChatPromptPanel.vue` 与 `ChatContainer.vue`。
- 公共入口：`index.ts` 显式导出 Tabs、Badge 以及 presentation 类型和函数；宿主不直接维护模式文案。
