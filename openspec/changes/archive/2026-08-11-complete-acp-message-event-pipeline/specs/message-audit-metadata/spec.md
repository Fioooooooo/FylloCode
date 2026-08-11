## ADDED Requirements

### Requirement: 新消息记录创建与最后更新时间

所有新版 user 与 assistant `UIMessage` SHALL 在 `MessageMeta` 中记录 `createdAt` 与 `updatedAt`。`createdAt` SHALL 表示消息首次创建时间；`updatedAt` SHALL 表示消息内容、工具状态或持久元数据最后一次实际变化的时间。无有效变化的重复事件 SHALL NOT 推进 `updatedAt`。

#### Scenario: 新建 user message

- **WHEN** Chat、Proposal Apply、Proposal Archive、spawned turn 或自动 notification 创建新的 user message
- **THEN** 该消息 SHALL 同时包含 createdAt 与 updatedAt
- **AND** 初始 updatedAt SHALL 等于 createdAt

#### Scenario: assistant 持续接收内容

- **WHEN** assistant message 收到会增加或替换 text、reasoning、tool part 或持久工具 metadata 的事件
- **THEN** Main 与 Renderer 消息 SHALL 推进 updatedAt
- **AND** Main 最终持久化值 SHALL 表示最后一次实际消息变化时间

#### Scenario: 重复无效 update

- **WHEN** tool update 没有造成任何 part 或持久 metadata 变化
- **THEN** 消息 updatedAt SHALL 保持不变

#### Scenario: user message 被补充 reminder 或 dispatch metadata

- **WHEN** 已持久化 user message 被插入 system reminder，或写入本轮实际 model/effort
- **THEN** 系统 SHALL 推进该消息 updatedAt
- **AND** SHALL 按精确 message ID 更新，不得按当前 active Session 或最后一条消息猜测

### Requirement: model 与 effort 来自实际 Prompt dispatch

系统 SHALL 在每轮底层 ACP Prompt 实际 dispatch 后，从该次 dispatch 使用的完整 config options snapshot 中读取 `category === "model"` 与 `category === "thought_level"` 的 select currentValue，并分别写为该轮 user 与 assistant 消息的可选 `model` 与 `effort`。系统 SHALL NOT 从 Renderer 提交前配置、事后 session 当前配置、option id/名称、Agent identity 或消息内容反推这些值。

#### Scenario: 正常 Chat turn dispatch

- **WHEN** Chat turn 在 resume、load、fresh recovery 或 override 结算后实际 dispatch Prompt
- **THEN** 该轮 user 与 assistant 消息 SHALL 记录相同的实际 model 与 effort snapshot
- **AND** 后续 config update SHALL NOT 改写既有消息的 snapshot

#### Scenario: Apply、Archive 与 spawned turn dispatch

- **WHEN** Proposal Apply、Proposal Archive、spawned turn 或自动 notification 实际 dispatch Prompt
- **THEN** 对应 user 与 assistant 消息 SHALL 使用相同的 dispatch snapshot 规则
- **AND** 既有 spawned turn config summary SHALL 保持独立，不替代 MessageMeta

#### Scenario: config category 缺失

- **WHEN** 实际 config snapshot 没有 model 或 thought_level category
- **THEN** 对应 MessageMeta 字段 SHALL 保持缺失
- **AND** 系统 SHALL NOT 使用默认字符串或其他 config option 猜测

#### Scenario: Prompt 未实际 dispatch

- **WHEN** user message 已 durable append，但 ACP Prompt 在 dispatch 前失败或被取消
- **THEN** user message SHALL 保留 createdAt/updatedAt
- **AND** model 与 effort MAY 保持缺失
- **AND** 系统 SHALL NOT 创建空 assistant message

### Requirement: dispatch metadata 同步到实时与持久消息

Prompt dispatch metadata SHALL 通过明确的内部 turn metadata 事件交给 Main assembler、Renderer assembler 和 user-message 持久化 hook。该事件本身 SHALL NOT 创建 assistant message；当 assistant 内容稍后到达时，两个 assembler SHALL 将缓存的 model/effort 写入各自消息。

#### Scenario: metadata 先于首个 assistant 内容到达

- **WHEN** turn metadata 在首个 assistant content event 之前到达
- **THEN** assembler SHALL 缓存该轮 model/effort
- **AND** SHALL NOT 仅因 metadata 创建空 assistant message
- **AND** 首个内容创建的 assistant message SHALL 带有该 snapshot

#### Scenario: metadata 在 assistant 已创建后到达

- **WHEN** assistant 临时或 Main message 已存在时收到 turn metadata
- **THEN** assembler SHALL 更新该消息的 model/effort 与 updatedAt
- **AND** SHALL 保留已有 parts 与 message ID

#### Scenario: user message 精确回填

- **WHEN** turn metadata 包含本轮 userMessageId
- **THEN** Main SHALL 在对应 message JSONL 中 patch 该 ID 的 metadata
- **AND** Renderer SHALL patch 同 ID 的内存 user message
- **AND** SHALL NOT 修改其他轮消息

### Requirement: 消息审计字段兼容旧历史且当前不展示

历史消息缺少 `updatedAt` 时，读取层 SHALL 在内存中回退到 createdAt；缺少 model/effort 时 SHALL 保持缺失。当前消息组件 SHALL 继续只按现有行为展示 createdAt，不得新增 model、effort 或 updatedAt 文案。MessageMeta SHALL NOT 增加 Agent 字段。

#### Scenario: 加载旧 JSONL 消息

- **WHEN** 历史消息只有 sessionId 与 createdAt
- **THEN** Renderer SHALL 成功加载该消息
- **AND** 内存 updatedAt SHALL 等于 createdAt
- **AND** model 与 effort SHALL 保持缺失

#### Scenario: 加载新消息

- **WHEN** 新消息包含 updatedAt、model 与 effort
- **THEN** Renderer SHALL 将 createdAt 与 updatedAt 恢复为 Date 并保留其余字段
- **AND** 消息内容 SHALL 正常渲染

#### Scenario: 当前消息操作区

- **WHEN** 新消息包含全部审计字段
- **THEN** `ChatMessageActions` 与 `MessageTime` SHALL 继续只显示现有 createdAt 时间
- **AND** SHALL NOT 新增 model、effort 或 updatedAt 的可见 UI

#### Scenario: Agent 归属保持在 Session

- **WHEN** 新版消息被创建或加载
- **THEN** MessageMeta SHALL NOT 包含 Agent identity
- **AND** 系统 SHALL 继续使用 session meta 的固定 Agent 归属

### Requirement: JSONL metadata patch 不得破坏消息历史

对已持久化 user message 回填 audit metadata 时，系统 SHALL 按消息文件串行 append、reminder rewrite 与 metadata patch，并 SHALL 使用原子写回或等价防截断机制。任一 JSONL 行损坏时 SHALL 明确失败，SHALL NOT 静默跳过损坏行后覆盖文件。

#### Scenario: append 与 metadata patch 相邻发生

- **WHEN** 同一消息文件正在追加 assistant message，同时需要 patch 对应 user message metadata
- **THEN** 两项写入 SHALL 按同一 per-file queue 串行
- **AND** 最终文件 SHALL 同时保留两条消息和 metadata 更新

#### Scenario: JSONL 存在损坏行

- **WHEN** metadata patch 读取到无法解析的非空 JSONL 行
- **THEN** patch SHALL 失败并报告行定位
- **AND** 原消息文件 SHALL 保持未被该次 patch 覆盖
