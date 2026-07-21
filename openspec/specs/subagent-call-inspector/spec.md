# subagent-call-inspector Specification

## Purpose

定义 ACP 子 Agent 调用在主进程归一化、消息组装与渲染进程检查器中的责任边界，确保父子工具关联、运行摘要白名单、最终回复和历史重载行为以本规范为契约来源。

## Requirements

### Requirement: 系统归一化并保留 Claude Code 子 Agent 运行摘要

系统 SHALL 仅在 Claude Code adapter 确认 ACP 工具为 Agent 工具时，为该父工具产生可选的结构化子 Agent 运行摘要。摘要 SHALL 只包含规范状态、Agent 类型、resolved model、总 token、总耗时、总工具调用数及白名单工具统计；系统 SHALL NOT 从 Claude Code `toolResponse` 把完整响应、usage、内部 agent ID 或任意未知字段复制到摘要。Prompt 与最终回复 SHALL 继续使用父工具既有的 input 与 output，标准 ACP content SHALL 作为不透明文本完整保留。

#### Scenario: Agent start 建立子 Agent marker

- **WHEN** Claude Code Agent 工具发出 start 或 in-progress update，且统计尚不可用
- **THEN** 系统 SHALL 在父工具事件中包含子 Agent marker 与可用的运行中状态或 Agent 类型
- **AND** 系统 SHALL NOT 等待第一个子工具出现后才确认该父工具

#### Scenario: toolResponse 中间 update 提供运行统计

- **WHEN** Claude Code Agent 工具发出仅在 `_meta.claudeCode.toolResponse` 中包含统计的中间 update
- **THEN** 系统 SHALL 提取合法的 `resolvedModel`、`totalTokens`、`totalDurationMs`、`totalToolUseCount` 与白名单 `toolStats`
- **AND** 随后的标准 completed update SHALL 保留已经提取的统计

#### Scenario: completed content 包含多个文本块

- **WHEN** Claude Code Agent update 的标准 ACP content 包含多个文本块
- **THEN** Claude adapter SHALL 按原始顺序保留全部文本块，并使用两个换行符连接相邻文本块
- **AND** 系统 SHALL NOT 解析、过滤或根据文本内容识别供应商尾注
- **AND** 非 Agent Claude 工具及其他 Agent adapter 的现有 content 拼接行为 SHALL 保持不变

#### Scenario: 非法或未知统计字段被拒绝

- **WHEN** Agent `toolResponse` 包含负数、非有限数字、错误类型或白名单之外的字段
- **THEN** 系统 SHALL 忽略对应非法或未知字段
- **AND** 其余合法摘要与工具输入输出 SHALL 继续可用

#### Scenario: 非 Claude 或非 Agent 工具不获得私有语义

- **WHEN** 工具事件来自非 Claude adapter，或 Claude 工具不是 Agent 工具
- **THEN** 系统 SHALL NOT 根据 title、toolName 或输入文本推断子 Agent 运行摘要
- **AND** 该工具的现有映射与展示 SHALL 保持不变

#### Scenario: 子 Agent token 不改变会话 token usage

- **WHEN** 子 Agent 摘要包含 `totalTokens`
- **THEN** 系统 SHALL 只把该值用于子 Agent 详情展示
- **AND** 系统 SHALL NOT 将其累加到 session token usage 或替代 ACP done token

### Requirement: 实时与历史消息采用同一子 Agent 元数据

系统 SHALL 将 `parentToolCallId` 与子 Agent 运行摘要增量合并到父子工具的 `toolMetadata`，并让 renderer 实时 assembler 与 main 持久化 assembler 遵循相同规则。缺失字段的后续 update SHALL NOT 清除已经收到的父子关系或摘要字段。

#### Scenario: parentToolCallId 在 update 阶段延迟到达

- **WHEN** 子工具 start 缺少 `parentToolCallId`，但后续 update 提供该字段
- **THEN** 实时消息与最终持久化消息 SHALL 都把该子工具关联到指定父工具

#### Scenario: 仅包含摘要的 update 仍更新消息

- **WHEN** 父工具 update 没有 title、input、content 或 output delta，但包含子 Agent 摘要
- **THEN** 两套 assembler SHALL 合并该摘要
- **AND** 该 update SHALL NOT 清空父工具已有的友好 title、input 或 output

#### Scenario: 重载已完成会话

- **WHEN** 用户重新加载由新版 assembler 持久化的历史消息
- **THEN** 子 Agent 卡片、父子工具关系、统计与最终回复 SHALL 与流结束时一致
- **AND** 系统 SHALL NOT 依赖运行时 store 重建这些数据

#### Scenario: 旧历史消息缺少摘要

- **WHEN** 历史工具只有 `parentToolCallId` 而没有子 Agent 摘要
- **THEN** renderer SHALL 仍可根据安全的同消息关系展示父卡片与子工具
- **AND** 不可用统计 SHALL 显示为缺失而不是被推算

### Requirement: Renderer 安全投影子 Agent 调用树

Renderer SHALL 在单条 assistant message 内按 `toolCallId` 与 `parentToolCallId` 投影子 Agent 调用树，且 SHALL NOT 依赖工具在 parts 中连续出现。父工具显式带有子 Agent marker，或被同消息工具安全引用时， SHALL 成为子 Agent 节点。

#### Scenario: 非连续子工具归属同一父调用

- **WHEN** 多个子工具以同一 `parentToolCallId` 指向父工具，即使它们在 message parts 中不连续
- **THEN** renderer SHALL 将这些子工具收进同一父调用详情
- **AND** 工具活动顺序 SHALL 保持原始 part 顺序

#### Scenario: 并行子 Agent 调用互不串组

- **WHEN** 一条 assistant message 中存在多个父 Agent 工具及交错到达的子工具
- **THEN** renderer SHALL 按各自父链形成独立根调用
- **AND** 一个根调用的 Slideover SHALL NOT 展示另一个根调用的后代

#### Scenario: 嵌套子 Agent 保留层级

- **WHEN** 子 Agent 的后代工具再次成为其他工具的父节点
- **THEN** renderer SHALL 把全部可安全连接的后代包含在根调用详情中
- **AND** 每个后代 SHALL 带有相对根调用的 depth 供 UI 缩进展示

#### Scenario: 孤儿或跨消息父引用降级

- **WHEN** 子工具引用的父工具不在同一 assistant message
- **THEN** renderer SHALL 保留该子工具的现有普通工具展示
- **AND** renderer SHALL NOT 因无法关联而隐藏它

#### Scenario: self-edge、循环或重复 ID 降级

- **WHEN** 父子关系包含 self-edge、cycle 或不能唯一解析的重复 toolCallId
- **THEN** renderer SHALL 拒绝不安全关系
- **AND** 涉及的不安全工具 SHALL 继续按普通工具展示而不造成无限遍历

### Requirement: 父 Agent 工具渲染为独立可访问卡片

Renderer SHALL 在父工具原本所在的 assistant message 位置渲染独立子 Agent 卡片。父卡片 SHALL 与普通连续工具分组隔离；只有已安全连接到该根调用的后代工具 SHALL 从顶层消息隐藏。卡片 SHALL 展示描述性标题、文字状态与可用的摘要指标，并可通过指针或键盘打开详情。

#### Scenario: 父工具替换普通工具卡

- **WHEN** message projection 确认一个顶层父工具为子 Agent 调用
- **THEN** renderer SHALL 在该父工具的 part 位置显示子 Agent 卡片
- **AND** 该卡片 SHALL NOT 被合并进前后普通 `ChatToolGroup`

#### Scenario: 已关联后代不再平铺

- **WHEN** 子工具已安全归属于可见父卡片
- **THEN** renderer SHALL 从 assistant 消息顶层工具序列隐藏该子工具
- **AND** 该工具 SHALL 仍可在父卡片的 Slideover 中访问

#### Scenario: 卡片状态随流更新

- **WHEN** 父工具仍属于当前正在 stream 的 assistant message
- **THEN** 卡片 SHALL 显示“正在运行”状态并随摘要更新
- **WHEN** 摘要进入 completed 或 failed 终态
- **THEN** 卡片 SHALL 分别显示完成或失败文字状态

#### Scenario: 未终结的历史父工具显示中断

- **WHEN** 父工具最后状态仍为 in-progress，但对应 assistant message 已不是当前 stream
- **THEN** 卡片 SHALL 显示“已中断”而不是永久显示运行中

#### Scenario: 键盘打开并返回焦点

- **WHEN** 键盘用户聚焦父卡片并激活它
- **THEN** renderer SHALL 打开对应 Slideover，并提供可见焦点与 `aria-expanded`
- **WHEN** Slideover 关闭
- **THEN** 焦点 SHALL 返回触发该详情的父卡片

### Requirement: Slideover 响应式展示子 Agent 完整可观测信息

子 Agent Slideover SHALL 通过响应式 assistant message 与根 toolCallId 读取最新投影，而不是保存点击时快照。它 SHALL 展示 prompt、Agent 类型、resolved model、运行状态、上游统计、按 depth 排列的工具活动及父工具最终回复；长内容 SHALL 可访问但默认保持受控信息密度。

#### Scenario: 打开期间继续收到子工具和统计

- **WHEN** 用户在子 Agent 仍运行时打开 Slideover，随后 message 收到新的子工具、统计或最终 output
- **THEN** 已打开的 Slideover SHALL 自动展示最新数据
- **AND** 用户 SHALL NOT 需要关闭后重新打开详情

#### Scenario: 展示 prompt 与最终回复

- **WHEN** 父工具 input 包含 prompt 且 output 已可用
- **THEN** Slideover SHALL 分区展示完整 prompt 与最终回复
- **AND** 父工具之后的普通 assistant 文本 SHALL 继续留在主消息原位置

#### Scenario: 指标使用上游值

- **WHEN** 摘要提供总 token、总耗时、总工具调用数或白名单工具统计
- **THEN** Slideover SHALL 展示对应上游数值与明确标签
- **AND** renderer SHALL NOT 用可见后代数量或 session token usage 替代缺失值

#### Scenario: 统计或 prompt 缺失

- **WHEN** 某个指标或 prompt 未由上游提供
- **THEN** Slideover SHALL 对该值显示 `—` 或明确的不可用状态
- **AND** Slideover SHALL NOT 隐藏其余已经可用的信息

#### Scenario: 运行中尚无工具活动

- **WHEN** 子 Agent 仍在运行且尚无安全关联的后代工具
- **THEN** Slideover SHALL 显示“等待子 Agent 工具调用…”运行状态

#### Scenario: 终态没有工具活动

- **WHEN** 子 Agent 已完成或失败，但没有安全关联的后代工具
- **THEN** Slideover SHALL 使用 compact 空状态显示“未记录工具调用”

#### Scenario: 长工具输入输出受控展开

- **WHEN** 子工具 input 或 output 内容较长
- **THEN** 工具活动项 SHALL 默认折叠详细内容，并在用户展开后提供限高滚动区域
- **AND** renderer SHALL NOT 为布局目的截断底层内容数据

#### Scenario: Slideover 关闭后不保留派生副本

- **WHEN** 用户关闭子 Agent Slideover
- **THEN** renderer SHALL 清理该卡片的 open 状态和详情视图资源
- **AND** 消息 parts SHALL 继续作为父子关系与统计的唯一事实源
