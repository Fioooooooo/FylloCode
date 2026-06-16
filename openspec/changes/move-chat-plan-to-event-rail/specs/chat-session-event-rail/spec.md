## ADDED Requirements

### Requirement: Chat 主区域提供右侧会话事件栏

系统 SHALL 在 Chat 主区域提供一个会话事件栏结构，用于展示当前会话的结构化事件卡片。事件栏 SHALL 位于消息列表区域右侧，由 `ChatContainer.vue` 编排，并通过独立组件承载事件栏内部结构。

事件栏本次 SHALL 只承载执行计划事件，数据来自当前 `activeSession.plan`。系统 SHALL NOT 在本能力中扫描 assistant markdown、聚合 `<fyllo-action>`、读取 proposal apply/archive 进度、创建通用事件数据模型、添加 IPC 或新增持久化字段。

事件栏无可展示事件时 SHALL 不渲染可见容器，避免占用聊天主区域空间。

#### Scenario: 活跃会话存在 plan 时显示事件栏

- **WHEN** 当前为已建立 session
- **AND** `activeSession.plan` 含至少 1 条计划项
- **THEN** Chat 主区域右侧显示会话事件栏
- **AND** 事件栏内显示执行计划事件卡片

#### Scenario: 无事件时隐藏事件栏

- **WHEN** 当前为已建立 session
- **AND** `activeSession.plan` 为 `undefined` 或空数组
- **THEN** Chat 主区域不显示会话事件栏的可见容器

#### Scenario: 草稿态不显示事件栏

- **WHEN** 当前处于草稿态（`activeSessionId === null`）
- **THEN** Chat 主区域不显示会话事件栏
- **AND** 不显示执行计划事件卡片

### Requirement: 事件栏不得遮挡消息流和输入区

事件栏 SHALL 作为 Chat 主区域内的右侧辅助区域呈现，但不得遮挡用户阅读消息、查看流式错误或操作 `ChatPromptPanel`。`ChatContainer.vue` SHALL 将消息列表、流式错误和 `ChatPromptPanel` 作为一个 conversation column 处理，并将事件栏作为该 conversation column 右侧的 sibling。

当事件栏显示时，conversation column SHALL 被整体向左挤压，与事件栏左右并排展示。`ChatPromptPanel` SHALL 与消息列表保持同一列宽和水平对齐。系统 SHALL NOT 只拆分上方消息区域而让 `ChatPromptPanel` 保持原居中位置。

窗口宽度不足时，系统 SHALL NOT 自动隐藏事件栏；事件栏继续通过左右并排布局挤压 conversation column。系统 MAY 让消息文本换行、代码块横向滚动或让 conversation column 变窄，但 MUST NOT 让事件栏覆盖消息列表或输入区。

#### Scenario: 事件栏显示时 conversation column 整体让位

- **WHEN** 当前 session 存在 plan
- **THEN** 事件栏显示在消息列表区域右侧
- **AND** 消息列表、流式错误块和 `ChatPromptPanel` 作为同一个 conversation column 整体向左让出 rail 空间
- **AND** `ChatPromptPanel` 与消息列表保持同一列宽和水平对齐

#### Scenario: 窗口变窄时不自动隐藏 rail

- **WHEN** 当前窗口宽度不足以安全显示右侧事件栏
- **AND** 当前 session 存在 plan
- **THEN** 系统继续显示事件栏
- **AND** conversation column 被压缩
- **AND** 事件栏不覆盖消息列表、流式错误块或 `ChatPromptPanel`

### Requirement: 事件栏支持用户手动收起和展开

系统 SHALL 为事件栏提供手动收起和展开控制。该控制 SHALL 是 Chat 主区域的局部布局控制，不得放入 `ChatPromptPanel`、全局 header 或 `ChatPlanPanel` 内部。

事件栏展开时，收起按钮 SHALL 位于事件栏顶部标题区域的左侧，并靠近 conversation column 与事件栏的分隔线。事件栏被用户手动收起后，系统 SHALL 在 Chat 主区域右侧边界保留一个窄的展开 handle，供用户恢复事件栏。

手动收起状态 SHALL 只作为 renderer 局部 UI 状态维护，不持久化到 session meta，不新增 IPC，不影响 `Session.plan` 数据。

#### Scenario: 用户收起事件栏

- **WHEN** 当前 session 存在 plan 且事件栏处于展开状态
- **AND** 用户点击事件栏顶部靠近分隔线的收起按钮
- **THEN** 事件栏内容被收起
- **AND** Chat 主区域右侧边界显示展开 handle
- **AND** `Session.plan` 不被修改

#### Scenario: 用户重新展开事件栏

- **WHEN** 当前 session 存在 plan 且事件栏处于收起状态
- **AND** 用户点击右侧边界的展开 handle
- **THEN** 事件栏重新展开并显示执行计划事件卡片
- **AND** conversation column 再次被整体挤压，为事件栏让出右侧空间
