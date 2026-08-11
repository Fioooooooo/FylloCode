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

Renderer SHALL 为每个可见普通工具提供可理解的 ACP 执行状态，但 SHALL NOT 在 pending、in_progress 或 completed 工具名称后追加可见状态文案。pending 与 in_progress SHALL 使用现有 Nuxt UI shimmer 表达非终态，completed SHALL 使用无 shimmer 的稳定工具名称；三者仍 SHALL 提供屏幕阅读器可识别的状态文字。失败工具 SHALL 同时显示可见“失败”文字、error 语义色的具体工具 icon，并在可折叠详情中使用独立 `Error` 分区展示可用 errorText。Activity group 顶层 SHALL 保持既有类别统计、代表图标和 streaming 规则，不增加整组状态前缀。

#### Scenario: pending 工具

- **WHEN** 普通工具的 acpStatus 为 pending
- **THEN** 该具体工具 SHALL 只以工具名称作为可见标题并显示 shimmer
- **AND** SHALL NOT 追加可见“等待执行”或“已完成”文字
- **AND** 屏幕阅读器 SHALL 能识别“等待执行”状态

#### Scenario: in-progress 工具

- **WHEN** 普通工具的 acpStatus 为 in_progress
- **THEN** 该具体工具 SHALL 只以工具名称作为可见标题并显示 shimmer
- **AND** SHALL NOT 追加可见“正在执行”文字
- **AND** 屏幕阅读器 SHALL 能识别“正在执行”状态

#### Scenario: completed 工具

- **WHEN** 普通工具的 acpStatus 为 completed
- **THEN** 该具体工具 SHALL 只显示无 shimmer 的稳定工具名称
- **AND** SHALL NOT 追加可见“已完成”文字
- **AND** 屏幕阅读器 SHALL 能识别“已完成”状态
- **AND** 可用 output SHALL 继续显示在 Output 分区

#### Scenario: failed 工具

- **WHEN** 普通工具进入 failed / output-error 终态
- **THEN** 该具体工具 SHALL 显示可见“失败”文字
- **AND** 该具体工具的 leading icon SHALL 使用 error 语义色
- **AND** 用户展开工具后 SHALL 在 Error 分区看到可用错误文本
- **AND** 失败 SHALL NOT 被呈现为成功 Output 或只依赖颜色表达

#### Scenario: Activity group 子工具

- **WHEN** 用户展开 Activity group 并查看其中一个具体工具
- **THEN** 该子工具 SHALL 使用与直接工具相同的可见标题、shimmer、可访问状态、失败文字和失败 icon 规则
- **AND** Activity group header SHALL 继续使用既有类别摘要、代表图标和 streaming 视觉

### Requirement: 普通工具详情展示 diff 与 locations

Renderer SHALL 在普通工具详情中以精简文件入口展示 toolMetadata 已有的 diff 路径，并继续展示完整 locations；直接工具与 Activity group 子工具 SHALL 复用同一详情组件。Changes 分区 SHALL NOT 在消息流内直接渲染完整 oldText/newText、“修改前 / 修改后”或“新增内容”，而 SHALL 允许用户打开当前 turn 的文件变更审查 Slideover。没有对应值时 SHALL 不产生空分区；展示与打开操作 SHALL NOT 修改底层消息数据。

#### Scenario: 修改文件 diff

- **WHEN** 工具包含 path、oldText 与 newText 的 diff，且该路径仍属于当前 turn 的净变化
- **THEN** 用户展开工具后 SHALL 在 Changes 分区看到该 path 与“修改”类型
- **AND** Changes 分区 SHALL NOT 内联显示完整 oldText 或 newText
- **AND** 激活该 path SHALL 打开文件变更 Slideover 并默认选中该文件

#### Scenario: 新文件 diff

- **WHEN** 工具 diff 的 oldText 缺失，且该路径仍属于当前 turn 的净变化
- **THEN** Changes 分区 SHALL 将该 path 标记为“新增”
- **AND** SHALL NOT 在消息流内展示“新增内容”或完整 newText
- **AND** 激活该 path SHALL 在文件变更 Slideover 中以空 original 和完整 newText 展示

#### Scenario: 多个 diff 保持入口顺序

- **WHEN** 工具包含多个仍属于当前 turn 净变化的 diff path
- **THEN** Renderer SHALL 按该工具 metadata 的首次路径顺序显示去重入口
- **AND** 每个入口 SHALL 指向同一 turn 文件变更集合并以自身 path 作为初始选择

#### Scenario: location 包含行号

- **WHEN** 工具 location 包含 path 与 line
- **THEN** Locations 分区 SHALL 同时显示路径与行号
- **AND** 可预览路径 SHALL 提供键盘可访问的打开操作

#### Scenario: location 不含行号

- **WHEN** 工具 location 只有 path
- **THEN** Locations 分区 SHALL 显示该 path
- **AND** SHALL NOT 伪造行号

#### Scenario: 工具没有可见 diff 或 location

- **WHEN** 工具 metadata 不包含 diff/locations，或其 diff paths 已不属于当前 turn 的净变化
- **THEN** Renderer SHALL 不显示对应 Changes 或 Locations 空分区
- **AND** Input、Output、Error 与折叠行为 SHALL 保持正常

### Requirement: 当前 turn 文件变更使用只读 Diff Slideover 审查

Renderer SHALL 将一条 assistant message 视为一个 turn，从该消息的可见普通 tool parts 聚合结构化 ACP diff，并在与现有文件预览宽度一致的 window-level Slideover 中以 Nuxt UI Accordion 文件列表展示该 turn 的净文件变化。Accordion SHALL 默认折叠全部文件，并允许用户任意展开或收起多个文件；每个文件项 SHALL 维护独立的只读 `stream-monaco` Diff Editor，收起时 SHALL 只隐藏 content 而不销毁 editor。Diff Editor SHALL 关闭 Monaco `diffOverview`。该视图 SHALL 使用消息中已持久化的 diff snapshot，不得重新读取磁盘、聚合整个 Session 或把结果声明为当前 Git/worktree diff。

#### Scenario: 当前 turn 聚合可见普通工具

- **WHEN** 一条 assistant message 的多个直接工具或 Activity group 子工具包含 diff
- **THEN** 文件变更列表 SHALL 聚合这些可见普通工具的 diff
- **AND** SHALL 按路径首次出现顺序排列
- **AND** SHALL 排除子 Agent 根调用以及只在子 Agent inspector 中可见的隐藏后代工具

#### Scenario: 同一路径在当前 turn 多次变化

- **WHEN** 当前 turn 中同一路径按事件顺序出现多次 diff snapshot
- **THEN** 聚合结果 SHALL 使用最早出现的 oldText 作为 original
- **AND** SHALL 使用最后出现的 newText 作为 modified
- **AND** SHALL NOT 为该路径显示中间版本或重复列表项

#### Scenario: 当前 turn 恢复原状

- **WHEN** 某路径的最终 modified 与最早 original 完全相同
- **THEN** 该路径 SHALL 从 turn 文件变更列表移除
- **AND** 对应工具详情 SHALL 不保留指向陈旧 diff 的 Changes 入口

#### Scenario: 从工具入口打开完整 turn

- **WHEN** 用户激活某个工具 Changes 分区中的文件 path
- **THEN** Renderer SHALL 打开包含当前 turn 全部净文件变化的同一个 Slideover
- **AND** SHALL 默认选中被激活的 path
- **AND** 用户 SHALL 能在 Slideover 内切换该 turn 的其他文件

#### Scenario: 修改文件 Diff Editor

- **WHEN** 选中文件具有非空 original 与不同的 modified
- **THEN** Diff Editor SHALL 以 original 为左侧、modified 为右侧显示完整只读差异
- **AND** 文件列表 SHALL 将该路径标记为“修改”

#### Scenario: 新增文件 Diff Editor

- **WHEN** 选中文件最早 diff 缺少 oldText 且最终 newText 非空
- **THEN** Diff Editor SHALL 使用空 original 和完整 modified
- **AND** 文件列表 SHALL 将该路径标记为“新增”

#### Scenario: 删除文件 Diff Editor

- **WHEN** 选中文件具有非空 original 且最终 newText 为空
- **THEN** Diff Editor SHALL 使用完整 original 和空 modified
- **AND** 文件列表 SHALL 将该路径标记为“删除”

#### Scenario: Accordion 默认全部折叠

- **WHEN** 用户打开包含一个或多个文件变化的 Slideover
- **THEN** Accordion SHALL 默认折叠当前 turn 的全部文件项
- **AND** 从任意工具 path 进入 SHALL NOT 自动展开该 path

#### Scenario: Accordion 任意多项展开与重复重开

- **WHEN** 用户收起或展开任意文件项
- **THEN** Renderer SHALL NOT 强制收起其他已展开文件项，也 SHALL NOT 限制同时展开数量
- **AND** Accordion SHALL 以 `unmount-on-hide=false` 或等价行为保留收起文件项的 content 与 Diff Editor
- **AND** 再次展开同一文件项 SHALL 继续显示原有完整内容，不得清空或重新创建 editor

#### Scenario: Accordion content 随 diff 自然展开

- **WHEN** 文件 diff 包含任意数量的行
- **THEN** 文件项 content SHALL NOT 使用固定高度或最大高度截断 Diff Editor
- **AND** Diff Editor SHALL 在 diff 与 unchanged ranges 更新后按 original、modified 两侧较大的可见 content height 自然撑开，而非按完整 model 行数保留已折叠行的空白
- **AND** 整组文件的纵向滚动 SHALL 由 Slideover body 承担
- **AND** SHALL NOT 为每个文件项创建嵌套的固定高度滚动区

#### Scenario: 默认折叠文件延迟创建 Diff Editor

- **WHEN** Slideover 初次显示默认折叠的文件列表
- **THEN** Renderer SHALL NOT 在不可见 content 中创建或测量对应 Diff Editor
- **AND** 文件第一次展开时 SHALL 创建并测量 Diff Editor
- **AND** 之后收起再展开 SHALL 继续复用已创建 editor，不得清空内容

#### Scenario: Diff Editor 不显示差异概览尺

- **WHEN** 用户展开任意文件项
- **THEN** Diff Editor SHALL 设置 `renderOverviewRuler=false`
- **AND** 右侧 SHALL NOT 渲染 Monaco `diffOverview` 或其 `diffViewport`
- **AND** Diff 内容、高亮和 Slideover 外层滚动 SHALL 保持可用

#### Scenario: streaming turn 更新打开的审查视图

- **WHEN** Slideover 打开期间当前 assistant message 收到新的有效 diff
- **THEN** Accordion 文件列表和所有已展开项的 Diff Editor SHALL 更新为新的 turn 净变化
- **AND** 仍存在路径 SHALL 保持用户当前的展开或收起状态
- **AND** 新出现路径 SHALL 默认折叠，消失路径 SHALL 从展开集合移除且不得显示陈旧内容

#### Scenario: 历史 turn 保持审计快照

- **WHEN** 用户从重新加载的历史 assistant message 打开文件变更
- **THEN** Slideover SHALL 使用该消息中持久化的 ACP diff snapshot 得到相同列表与内容
- **AND** SHALL NOT 读取当前磁盘文件替换 original 或 modified

#### Scenario: 主题、窄窗口与可访问 Accordion

- **WHEN** 用户在浅色、深色或窄窗口中打开 Slideover
- **THEN** Monaco 主题 SHALL 跟随当前 color mode
- **AND** Slideover 最大宽度 SHALL 与现有本地文件预览一致，桌面与窄窗口 SHALL 使用相同的全宽多项 Accordion，不得使用挤压 editor 的左右结构
- **AND** 文件 Accordion 触发项、关闭与 Changes 入口 SHALL 具有可见焦点和键盘操作能力

#### Scenario: 关闭审查释放资源

- **WHEN** Slideover 被关闭、替换或宿主卸载
- **THEN** Renderer SHALL 清理所有已创建文件项的 Monaco editor、可见高度 listener、待执行 RAF、响应式 watcher 和 feature controller
- **AND** 再次打开 SHALL 创建独立且无陈旧选择的审查生命周期
