## Context

当前 session 列表由 `frontend/src/components/chat/ChatSidebar.vue` 通过 `SessionItem.vue` 逐条渲染。`SessionItem.vue` 目前只消费 `session: Session`，展示运行状态点、标题、更新时间和轮次数。

ACP agent icon 的现有来源已经存在于 `useAcpAgentsStore.icons`。该 store 负责通过 `acpAgentsApi.getIcons()` 拉取并缓存 `Record<agentId, dataUrl>`，聊天消息区的 `UIMessageList.vue` 已经复用这份 icon 数据来渲染 assistant avatar。这意味着“按 `session.agentId` 解析 icon”已有成熟数据源，不需要新增 IPC 或持久化字段。

本次变更只调整 Chat 侧边栏会话项的展示信息层级，不改变 session 排序、选择、重命名、删除或消息区 avatar 的现有行为。

## Goals / Non-Goals

**Goals:**

- 让用户在进入 session 前即可识别该会话对应的 agent。
- 复用现有 ACP icon 数据源，不引入新的跨进程契约。
- 在 icon 未命中或尚未加载完成时保持稳定布局，不影响会话列表操作。

**Non-Goals:**

- 不移除聊天消息区内现有 assistant avatar 或 user avatar。
- 不修改 session 数据模型、创建流程、agent 锁定逻辑或 session 排序规则。
- 不在会话列表中新增 agent 名称文本，仅新增紧凑图标标识。

## Decisions

### 1. 将 agent icon 放在 `SessionItem.vue` 内部渲染

原因：

- `SessionItem.vue` 已经是单个 session 条目的展示边界，新增图标应和标题、状态点同属一个组件责任。
- `session.agentId` 已经存在于 `Session` 模型中，组件本地即可完成“session -> icon”映射，无需让 `ChatSidebar.vue` 先做预处理。

备选方案：

- 在 `ChatSidebar.vue` 预先把 `session` 映射为 view model 再传给 `SessionItem`。未采用，因为会引入额外中间层，但当前展示逻辑仍然简单。

### 2. 复用 `useAcpAgentsStore.icons`，不新增单独的会话列表图标加载逻辑

原因：

- `UIMessageList.vue` 已经证明该 store 能提供 `agentId -> icon` 映射。
- 复用现有 store 能保持 icon 缓存与更新行为一致，避免重复请求和双份状态。

备选方案：

- 在 `SessionItem.vue` 或 `ChatSidebar.vue` 自行调用 API 拉取图标。未采用，因为这会绕过既有 store 分层并制造重复缓存。

### 3. icon 缺失时保留固定尺寸占位，而不是切换为文本或完全塌缩

原因：

- `agent-registry-cache` spec 已允许部分 icon 不存在或延迟加载；列表不应因为 icon 状态不同而出现水平抖动。
- 固定尺寸占位可以让标题起始列对齐，保证侧边栏扫描节奏稳定。

备选方案：

- icon 缺失时直接不渲染任何前导区域。未采用，因为会导致部分 session 标题左边距不一致。
- icon 缺失时显示 agentId 文本缩写。未采用，因为这会显著增加横向占用，背离本次“紧凑识别”的目标。

## Risks / Trade-offs

- [图标尚未预热完成时出现空占位] → 通过固定尺寸占位和非阻塞加载避免布局跳动，图标加载完成后再无缝替换。
- [会话项横向空间更紧] → 保持 icon 为小尺寸前导元素，并继续使用标题截断，避免压缩时间/turn 信息到不可读。
- [测试 stub 未覆盖新增图像节点] → 在 renderer 组件测试中显式断言有/无 icon 的两种分支，避免只测交互不测展示。
