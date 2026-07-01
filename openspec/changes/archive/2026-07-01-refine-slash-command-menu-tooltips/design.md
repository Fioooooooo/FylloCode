## Context

slash command 菜单位于 `src/renderer/src/components/chat/prompt/SlashCommandMenu.vue`，由 `ChatPromptPanel.vue` 将当前 session 或 draft probe 的 `availableCommands` 传入。当前实现把 ACP command 映射为 `UCommandPalette` item，并使用 `description` 标准字段，因此 Nuxt UI 默认模板会在 label 下方渲染 description。

本变更需要把列表视觉收敛为单行命令名，同时仍保留 description 与 hint 的可发现性。键盘用户也必须能看到同一份详情，不能只支持鼠标 hover。

## Goals / Non-Goals

**Goals:**

- 列表项只显示 `/<command.name>`，不显示 description 行，也不保留空 description 行的高度。
- hover 与键盘上下键移动到某个 command 时，右侧 tooltip 展示该 command 的可用详情。
- tooltip 字段展示规则明确：`description`、`hint` 任一非空即显示；两者都为空时不显示 tooltip。
- 保留 command 数量、原始顺序、搜索、键盘导航和命令插入行为。

**Non-Goals:**

- 不修改 ACP command 数据结构、主进程 mapper、probe/store 通路或持久化格式。
- 不新增第三方 UI 依赖。
- 不重新设计 chat prompt 布局或 slash 按钮视觉。

## Decisions

### 使用 `UCommandPalette` 的 `highlight` 事件同步 tooltip

`UCommandPalette` 继承 Reka `ListboxRoot` 的 `highlight` 事件，payload 为 `{ ref: HTMLElement; value: T } | undefined`。实现应在 `SlashCommandMenu.vue` 中监听 `@highlight`，将当前高亮 item 的 DOM `ref` 作为受控 `UTooltip` 的 `reference`，将 item 中的 `command` 作为 tooltip 内容来源。

选择这个方案是因为 Reka 的 hover 和键盘导航都会更新同一个 highlighted item，能让鼠标 hover 与上下键移动共享同一套详情展示状态。

备选方案是在每个 item 内包 `UTooltip`。该方案对 hover 简单，但键盘高亮不一定触发 tooltip 打开，容易导致鼠标和键盘体验不一致。

### 不使用默认 `description` 字段渲染列表说明

`UCommandPalette` 默认模板只要 item 上存在 `description`，就会渲染 `itemDescription` 容器。即使提供空的 `#item-description` slot，也可能留下空的 description 容器和高度。

实现应避免把 command description 写入 item 的标准 `description` 字段。推荐保留 `command` 字段作为原始对象来源，并将 Fuse 搜索 keys 调整为 `label`、`command.description`、`command.hint`。这样列表不会渲染 description 行，但搜索仍可匹配说明和 hint。

### Tooltip 内容和布局

tooltip 使用 `UTooltip`，`content` 建议为 `{ side: "right", align: "center" }`，并使用现有语义文字样式：

- description：普通说明文本，使用 `text-sm text-default` 或等价语义样式。
- hint：参数/用法提示，使用 `用法: /<command.name> <hint>` 标明完整命令用法；前缀使用弱化的常规字体，完整用法值可使用 `font-mono`，整体使用更弱的 `text-xs text-muted`，不得影响可读性。若 agent 已经返回以 `/` 开头的完整 hint，直接展示该 hint，避免重复拼接命令名。

如果 `description` 与 `hint` 都为空或仅为空白，tooltip 不渲染。

tooltip 内容可能来自 agent，长度不可控。实现应给 tooltip 设置固定可读宽度、视口内最大宽度和最大高度，超出部分在 tooltip 内纵向滚动；description 使用普通换行，完整用法中的长命令、路径或 URL 可更积极断行，避免横向溢出。

### 菜单宽度随单行列表收敛

列表改为单行 label 后，popover 不应继续使用两行详情列表的宽面板宽度。实现应使用适合命令 label 扫读的紧凑宽度，同时保留视口内最大宽度约束，避免窄窗口溢出。

### 保留已修复的菜单行为

实现不得重新引入 Nuxt UI 默认 `resultLimit: 12` 截断、Fuse 排序改变原始顺序、或 `/` 触发时把 `/` 带入 palette 搜索词的问题。`SlashCommandMenu.vue` 应继续显式配置 `UCommandPalette` 的 fuse `resultLimit` 和排序策略，并确保 `/` 触发时 palette 初始 search term 为空。

## Risks / Trade-offs

- **Risk:** `highlight` payload value 被 `UCommandPalette` 通过 `omit(...)` 处理后 shape 与本地类型不一致。→ **Mitigation:** 使用运行时 type guard `isCommandMenuItem` 校验 `value.command`，不匹配时清空 tooltip 状态。
- **Risk:** 受控 tooltip 在菜单关闭后仍引用已卸载 DOM。→ **Mitigation:** 当 popover 关闭、commands 变空、或 `highlight` payload 为 `undefined` 时清空 `highlightedCommand` 与 `highlightedReference`。
- **Risk:** 只移除视觉 description 后搜索体验变差。→ **Mitigation:** Fuse keys 包含 `command.description` 和 `command.hint`，保持说明文本可搜索。
