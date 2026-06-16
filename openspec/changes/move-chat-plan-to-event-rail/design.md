## Context

`ChatContainer.vue` 当前是单列布局：消息滚动区占据上方，底部区域包含 `ChatPlanPanel` 和 `ChatPromptPanel`。`OriginTaskBanner` 已经作为 `ChatContainer` 内的绝对定位覆盖层存在，说明 Chat 主区域可以容纳局部 overlay，但必须避免遮挡消息流和输入区。

`ChatPlanPanel.vue` 已经把 plan 的展示逻辑封装在独立组件中，数据只依赖 `entries: PlanEntry[]`。`Session.plan` 是会话级内存态，不持久化；本次迁移不改变这条数据链路。

## Goals / Non-Goals

**Goals:**

- 在 `ChatContainer.vue` 内建立一个右侧会话事件栏结构，让后续事件类型有稳定挂载位置。
- 将 `ChatPlanPanel` 从底部输入框上方移入事件栏。
- 保持当前 plan 行为不变：空数组不渲染、草稿态不展示、折叠状态本地维护、状态和优先级视觉映射不变。
- 让消息列表、stream error 和 `ChatPromptPanel` 作为同一个 conversation column，与右侧事件栏左右并排展示。
- 事件栏出现时通过布局挤压 conversation column，不使用 overlay 覆盖消息或输入区，也不因窗口宽度不足自动隐藏。
- 提供用户手动收起/展开事件栏的控制；收起后右侧边界保留展开入口。

**Non-Goals:**

- 不扫描 assistant markdown，不聚合未完成 `<fyllo-action>`。
- 不接入 proposal apply/archive 进度。
- 不新增事件总线、Pinia store、IPC、持久化字段或跨进程数据模型。
- 不改变 `Session.plan`、`PlanEntry`、`useSessionStore.setSessionPlan` 或 `src/renderer/src/stores/chat.ts` 的 plan chunk 处理。

## Decisions

### Decision 1: 新增事件栏容器组件，不把逻辑堆进 ChatContainer

新增 `src/renderer/src/components/chat/event/ChatSessionEventRail.vue` 作为结构容器。`ChatContainer.vue` 只负责决定是否处于草稿态、传入当前 session 的 plan，并把事件栏放在主区域右侧。

备选方案是直接在 `ChatContainer.vue` 中写事件栏 DOM。该方案短期更少文件，但会让未来 Fyllo action、proposal 进度等事件直接膨胀 ChatContainer。独立容器更符合 renderer guideline 中组件负责展示与交互、复杂逻辑下沉的边界。

### Decision 2: 本次事件栏只接收 plan，不定义通用事件数据模型

`ChatSessionEventRail.vue` 本次接收 `planEntries: PlanEntry[]` 与 `isDraft` 相关输入即可。不要提前设计 `SessionEvent[]` 联合类型，因为未来 action/proposal 事件的数据来源、状态更新和交互边界尚未确定。

备选方案是一次性定义通用 `ChatSessionEvent` 类型。该方案会制造当前没有消费者验证的抽象，容易把未来事件的生命周期假设写死。

### Decision 3: Plan 组件优先复用，必要时只做容器适配

保留 `ChatPlanPanel.vue` 的核心展示行为。若事件栏宽度需要更紧凑的外边距或标题密度，优先通过外层容器控制宽度与间距；只有现有 `mx-2` 等布局类明显不适合 rail 时，才在 `ChatPlanPanel` 内做最小样式调整。

备选方案是新增一个 plan 专用 rail 卡片并复制列表渲染。该方案会让状态图标、优先级标记、折叠逻辑出现重复维护。

### Decision 4: 事件栏参与左右并排布局，挤压整个 conversation column

右侧事件栏 SHALL 作为 Chat 主区域布局的一列存在，而不是覆盖在消息滚动区上。`ChatContainer.vue` 应把消息列表、流式错误和 `ChatPromptPanel` 组织成同一个 conversation column，再把 `ChatSessionEventRail.vue` 作为右侧 sibling。

事件栏出现时，conversation column 整体向左让出空间；`ChatPromptPanel` 必须与消息列表保持同一列宽和水平对齐。这样用户输入的位置和消息出现的位置保持一致，避免“输入框居中但消息列左移”的错位感。

备选方案是只把上方消息区域拆成左右两列，底部 `ChatPromptPanel` 仍保持原位置。该方案会让输入区与消息列水平位置不一致，用户视线在输入与阅读之间横向跳动，因此不采用。

### Decision 5: 不做自动响应式隐藏，只提供用户手动收起

当当前 session 存在 plan 时，事件栏默认显示。窗口宽度不足时也不自动隐藏事件栏，而是继续挤压 conversation column；这与 Claude Desktop 的行为一致，也避免用户调整窗口时 plan 区域突然消失。

收起/展开控制属于当前 Chat 主区域的局部布局控制，位置 SHALL 贴近 conversation column 与 rail 的分隔线：

- 展开时，收起按钮放在 rail 顶部标题栏左侧，靠近分隔线，建议使用 `i-lucide-panel-right-close`。
- 手动收起后，在右侧边界保留窄的展开 handle，建议使用 `i-lucide-panel-right-open`。
- 控制按钮不得放在 `ChatPromptPanel`、全局 header 或 `ChatPlanPanel` 内部。

手动收起状态是 renderer 局部 UI 状态，本次不持久化、不写入 session meta，也不按 session 建立复杂偏好模型。

## Risks / Trade-offs

- conversation column 在主窗口最小宽度下变窄 → 接受类似 Claude Desktop 的挤压行为；通过固定 rail 宽度、紧凑 rail 间距和消息/代码块自身换行或横向滚动维持可用性。
- `ChatPlanPanel` 的 `mx-2` 等样式迁移到窄 rail 后显得松散 → Apply 阶段可做最小样式适配，但不得改变 plan 的状态语义。
- 事件栏空态造成无意义留白 → 当草稿态或 plan 为空时，事件栏不渲染可见容器。
- 用户可能临时需要更多消息宽度 → 通过分隔线附近的手动收起按钮隐藏 rail，并在右侧边界保留展开 handle。
- 过早抽象事件模型 → 本次只定义容器结构和 plan 插槽，不创建未被当前需求验证的事件 union。
