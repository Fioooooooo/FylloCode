# assistant-activity-display Specification

## Purpose

定义 AssistantMessage 对连续 reasoning/tool activity 的聚合边界，以及普通工具 Input/Output 详情、Codex MCP 输出归一化、子 Agent 例外和折叠交互契约。

## Requirements

### Requirement: 普通工具独立展示完整 Input 与 Output

Renderer SHALL 为 assistant message 中可见的普通工具调用提供可折叠详情，并在详情中使用独立且明确标记的 `Input` 与 `Output` 分区。系统 SHALL 展示 tool part 已有的完整值，不得只展示从 input 派生的 command、pattern 或其他 suffix 摘要，也不得为布局目的截断底层内容。

#### Scenario: 直接工具展示结构化输入输出

- **WHEN** 单个可见工具包含非空结构化 input 与 output
- **THEN** 工具标题行不显示 input suffix
- **AND** 用户展开工具后分别看到标记为 `Input` 与 `Output` 的完整格式化内容

#### Scenario: Activity group 内工具复用相同详情

- **WHEN** 普通工具作为 `ChatActivityGroup` 子项展示
- **AND** 用户展开 activity group 及其中一个具体工具
- **THEN** 该工具使用与直接工具相同的 Input/Output 分区、格式化和滚动行为

#### Scenario: Codex MCP 最终输出进入工具详情

- **WHEN** Codex ACP 的 MCP 完成事件通过 `rawOutput.result.content` 返回一个或多个 text block
- **THEN** 系统按原始顺序将文本归一化为该工具的最终 output
- **AND** 直接工具与 Activity group 内工具均能在 `Output` 分区查看该结果
- **AND** 旧版直接 `rawOutput.content` 形态继续得到相同处理

#### Scenario: 流式 output 持续更新

- **WHEN** dynamic tool 尚未完成但 `toolMetadata.liveOutput` 持续增加
- **THEN** 已展开工具的 `Output` 分区响应式显示最新完整 live output
- **AND** 工具完成后以最终 output 替代 live output

#### Scenario: 静态与动态工具使用一致格式

- **WHEN** AI SDK static tool part 或 dynamic tool part 提供 input 或 `output-available` output
- **THEN** Renderer 对字符串保留原文并对结构化值使用可读 JSON 格式
- **AND** 两种 tool part 使用相同的 Input/Output 标签与内容边界

#### Scenario: 缺失值不产生空分区

- **WHEN** 工具没有非空 input 或尚无可用 output
- **THEN** Renderer 不显示对应的空 Input 或 Output 分区
- **AND** 已存在的另一个分区仍正常显示

#### Scenario: 长工具内容受控展开

- **WHEN** Input 或 Output 超过工具详情的可视高度
- **THEN** 用户展开后可在限高区域内滚动查看完整内容
- **AND** Renderer 不截断或改写底层值

### Requirement: 连续 Reasoning 与 Tool 统一形成 Activity group

Renderer SHALL 在单条 assistant message 内按原始 part 顺序识别连续可见的 reasoning 与普通 tool activity run。只有 run 包含两个及以上 eligible activity 时，Renderer SHALL 将其投影为一个 `ChatActivityGroup`；单个 reasoning 或 tool SHALL 保持直接展示。该投影 SHALL NOT 修改、重排或复制 `message.parts`。

#### Scenario: ReAct 连续执行过程被收拢

- **WHEN** assistant message 依次包含 `reasoning -> tool(s) -> reasoning -> tool(s) -> text`
- **THEN** text 之前连续的 reasoning 与普通工具形成一个 `ChatActivityGroup`
- **AND** 最后的 text 保持在 activity group 之后的原始位置

#### Scenario: 连续纯工具使用 Activity group

- **WHEN** 一个连续 activity run 只包含两个及以上普通 tool part
- **THEN** Renderer 使用 `ChatActivityGroup` 聚合全部工具
- **AND** 不再存在独立的 tool-group 渲染类型

#### Scenario: 连续纯 Reasoning 使用 Activity group

- **WHEN** 一个连续 activity run 只包含两个及以上 reasoning part
- **THEN** Renderer 使用 `ChatActivityGroup` 聚合全部 Thinking

#### Scenario: 混合顺序从工具开始

- **WHEN** 一个连续 activity run 包含普通 tool 后再包含 reasoning
- **THEN** 只要 run 达到两个 eligible activity，Renderer 仍将整个 run 投影为一个 activity group
- **AND** 展开后的顺序与原始 part 顺序一致

#### Scenario: 单个 Tool 保持直接展示

- **WHEN** 一个 activity run 只有单个普通 tool
- **THEN** Renderer 直接展示该 Tool
- **AND** 不创建 `ChatActivityGroup`

#### Scenario: 单个 Thinking 保持直接展示

- **WHEN** 一个 activity run 只有单个 reasoning part
- **THEN** Renderer 直接展示该 Thinking
- **AND** 不创建 `ChatActivityGroup`

#### Scenario: Text 切断 Activity group

- **WHEN** 两段 reasoning/tool activity run 之间存在 text part
- **THEN** Renderer 分别判断两侧 run 是否达到分组阈值
- **AND** text 保持在两段 activity 之间的原始位置

### Requirement: SubagentCallCard 永远不进入 Activity group

子 Agent 根调用 SHALL 继续渲染为独立可访问的 `SubagentCallCard`，并 SHALL 成为普通 reasoning/tool activity run 的边界。`SubagentCallCard` 不属于 eligible activity；即使多个子 Agent 根卡片连续出现，Renderer 也 SHALL 逐个展示而不得把它们收进 `ChatActivityGroup`。安全归属子 Agent 的隐藏后代工具 SHALL 继续只在其 inspector 中访问。

#### Scenario: 子 Agent 根调用切断普通 Activity group

- **WHEN** reasoning/tool activity run 遇到已确认的子 Agent 根调用
- **THEN** Renderer 在根调用前结束当前 run 并独立渲染子 Agent 卡片
- **AND** 根调用之后的新普通 reasoning/tool activity 从新的 run 开始

#### Scenario: 连续子 Agent 卡片逐个展示

- **WHEN** assistant message 中连续出现两个或以上已确认的子 Agent 根调用
- **THEN** Renderer 按原始顺序展示每个独立 `SubagentCallCard`
- **AND** 不为这些卡片创建 `ChatActivityGroup`

#### Scenario: 隐藏后代不制造虚假边界

- **WHEN** 子 Agent inspector 已安全隐藏的后代工具在原始 parts 中与普通 activity 非连续交错
- **THEN** Renderer 不把隐藏 part 纳入普通 activity group
- **AND** 隐藏 part 本身不制造额外的可见分组边界

### Requirement: Activity group 延续现有工具组的摘要、图标与折叠规则

`ChatActivityGroup` SHALL 延续原工具组的单个可聚焦折叠入口、默认关闭状态与类别统计文案，并使用工具优先的代表性图标规则扩展到 reasoning。展开 group 后，每个 Thinking 与 Tool 子项也 SHALL 保持折叠，包括子项正在 streaming 时；用户仍可主动展开任一子项查看响应式内容。

#### Scenario: Activity summary 加入 Thinking 类别

- **WHEN** activity group 包含 reasoning 与一种或多种 tool kind
- **THEN** header 按各类别首次出现顺序组合计数摘要
- **AND** reasoning 使用 `Think x time(s)`，现有 Read/Write/Edit/Search/Run 文案与单复数规则保持不变

#### Scenario: Mixed Activity icon 优先表达工具行为

- **WHEN** group 内存在一个或多个 streaming tool
- **THEN** header 使用最后一个 streaming tool 的既有 kind icon 或 fallback
- **WHEN** group 内没有 streaming tool 但至少存在一个 tool
- **THEN** header 使用最后一个 tool 的既有 kind icon 或 fallback，即使其后还有 reasoning
- **WHEN** group 完全不包含 tool
- **THEN** header 使用 brain icon
- **AND** group 的 streaming 状态视觉继续由任意 streaming activity 驱动，不依赖代表图标

#### Scenario: 历史和流式 Activity group 默认折叠

- **WHEN** Renderer 展示历史或当前 streaming assistant message 中的 activity group
- **THEN** group 默认保持折叠
- **AND** streaming 只更新现有 header summary、icon 与状态视觉，不增加新的状态前缀文案

#### Scenario: 展开 Group 后子项仍保持折叠

- **WHEN** 用户展开 `ChatActivityGroup`
- **THEN** group 内的 Thinking 与 Tool 子项均保持折叠
- **AND** streaming reasoning 不得因 `UChatReasoning` 的默认行为自动展开
- **AND** 用户可以分别展开目标 Thinking 或 Tool

#### Scenario: 用户展开状态在追加 Activity 后保持

- **WHEN** 用户在 streaming 期间手动展开 activity group
- **AND** 同一连续 run 随后追加 reasoning 或普通 tool
- **THEN** group 保持展开并显示新增的折叠子项
- **AND** 追加不得因 group key 变化重置本地 open 状态

#### Scenario: 展开后保持原始 Activity 顺序

- **WHEN** 用户展开 activity group
- **THEN** reasoning 与普通工具按各自原始 `partIndex` 顺序展示

#### Scenario: 原始 partIndex 语义保持不变

- **WHEN** activity group 前后存在承载 Fyllo Action 的 text part
- **THEN** action context 继续使用 text part 在 `message.parts` 中的原始 `partIndex`
- **AND** 分组投影不改变 Action 的定位或状态关联

### Requirement: 普通工具展示明确执行状态与失败信息

Renderer SHALL 为每个可见普通工具显示可读的 ACP 执行状态，并 SHALL 同时使用文字表达等待执行、正在执行、已完成或失败，不能只依赖颜色、icon 或 streaming spinner。失败工具 SHALL 在可折叠详情中使用独立 `Error` 分区展示可用 errorText。Activity group 顶层 SHALL 保持既有类别统计、代表图标和 streaming 规则，不增加整组状态前缀。

#### Scenario: pending 工具

- **WHEN** 普通工具的 acpStatus 为 pending
- **THEN** 该具体工具 SHALL 显示“等待执行”文字状态
- **AND** SHALL NOT 显示为已完成

#### Scenario: in-progress 工具

- **WHEN** 普通工具的 acpStatus 为 in_progress
- **THEN** 该具体工具 SHALL 显示“正在执行”文字状态
- **AND** 现有 streaming 视觉 MAY 同时显示

#### Scenario: completed 工具

- **WHEN** 普通工具的 acpStatus 为 completed
- **THEN** 该具体工具 SHALL 显示“已完成”文字状态
- **AND** 可用 output SHALL 继续显示在 Output 分区

#### Scenario: failed 工具

- **WHEN** 普通工具进入 failed / output-error 终态
- **THEN** 该具体工具 SHALL 显示“失败”文字状态
- **AND** 用户展开工具后 SHALL 在 Error 分区看到可用错误文本
- **AND** 失败 SHALL NOT 被呈现为成功 Output

#### Scenario: Activity group 子工具

- **WHEN** 用户展开 Activity group 并查看其中一个具体工具
- **THEN** 该子工具 SHALL 使用与直接工具相同的状态文字和 Error 详情
- **AND** Activity group header SHALL 继续使用既有类别摘要

### Requirement: 普通工具详情展示 diff 与 locations

Renderer SHALL 在普通工具详情中展示 toolMetadata 已有的完整 diff 与 locations，且 SHALL 复用直接工具与 Activity group 子工具的同一详情组件。没有对应值时 SHALL 不产生空分区；展示 SHALL NOT 修改或截断底层消息数据。

#### Scenario: 修改文件 diff

- **WHEN** 工具包含 path、oldText 与 newText 的 diff
- **THEN** 用户展开工具后 SHALL 在 Changes 分区看到该 path
- **AND** SHALL 分别看到标记为“修改前”与“修改后”的完整只读内容

#### Scenario: 新文件 diff

- **WHEN** 工具 diff 的 oldText 缺失
- **THEN** Changes 分区 SHALL 将该项标记为新增文件
- **AND** SHALL 展示完整 newText 而不创建虚假旧内容

#### Scenario: 多个 diff 保持顺序

- **WHEN** 工具包含多个 diff
- **THEN** Renderer SHALL 按 metadata 原始顺序展示每个 path
- **AND** 每项内容 SHALL 在限高区域内滚动而不是截断

#### Scenario: location 包含行号

- **WHEN** 工具 location 包含 path 与 line
- **THEN** Locations 分区 SHALL 同时显示路径与行号
- **AND** 可预览路径 SHALL 提供键盘可访问的打开操作

#### Scenario: location 不含行号

- **WHEN** 工具 location 只有 path
- **THEN** Locations 分区 SHALL 显示该 path
- **AND** SHALL NOT 伪造行号

#### Scenario: 工具没有 diff 或 location

- **WHEN** 工具 metadata 不包含 diff 或 locations
- **THEN** Renderer SHALL 不显示对应 Changes 或 Locations 空分区
- **AND** Input、Output、Error 与折叠行为 SHALL 保持正常
