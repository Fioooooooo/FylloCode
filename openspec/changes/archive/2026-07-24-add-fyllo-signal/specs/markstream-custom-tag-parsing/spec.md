## ADDED Requirements

### Requirement: Agent-facing MarkStream 自定义标签共用 standalone Markdown block 边界

系统 SHALL 让需要渲染为 MarkStream custom node 的 agent-facing public 标签先经过统一 structural analyzer。只有位于 Markdown 代码区域之外、独占顶层 Markdown block 且具有对应 closing tag 的 occurrence 才能成为该标签的 candidate。

candidate opening tag SHALL 位于文件开头或空白行之后，行首只允许最多三个空格；closing tag 后至该 block 结束只允许空白，且后续 SHALL 为文件结尾或空白行。inline code、fenced code、list、blockquote、正文内联标签、opening tag 前或 closing tag 后存在说明文字的 occurrence SHALL 作为 literal Markdown。

structural analyzer SHALL 通过 public tag name 参数化，并为所有接入的自定义标签统一判断 fenced/inline code、缩进、前后空行、closed 和 candidate/literal。各标签协议的 semantic parser、payload schema、状态和 UI SHALL 保持独立。本次接入的 public tag 为 `<fyllo-action>` 与 `<fyllo-signal>`；未来新增 agent-facing MarkStream 自定义标签 SHALL 复用并扩充本 capability，而不是复制 structural analyzer。

#### Scenario: Closed standalone custom tag becomes a candidate

- **WHEN** assistant text part 包含一个已接入的 public custom tag，且其位于代码区域之外、前后满足空白 block 边界并具有 closing tag
- **THEN** 系统 SHALL 将该 occurrence 识别为对应标签的 candidate
- **AND** SHALL 把 attrs 与 body 交给该标签自己的 semantic parser

#### Scenario: Registered custom tags apply the same structural boundary

- **WHEN** 相同 Markdown 上下文分别放置完整 Fyllo Action、Fyllo Signal 或未来接入的 public custom tag
- **THEN** 所有标签 SHALL 对 fenced code、inline code、缩进、list、blockquote 和前后空行作出相同的 candidate/literal 判定
- **AND** SHALL NOT 通过协议私有的重复扫描器产生分歧

#### Scenario: Inline and fenced custom-tag examples stay literal

- **WHEN** 完整的已接入 public custom tag 出现在 inline code 或 fenced code 中
- **THEN** 系统 SHALL 使用原生 Markdown code 节点显示完整原文
- **AND** SHALL NOT 创建对应 custom node

#### Scenario: Prose, list, and blockquote custom tags stay literal

- **WHEN** 已接入 public custom tag 出现在正文前后缀、list item 或 blockquote 中
- **THEN** 系统 SHALL 无损保留原始标签文本
- **AND** SHALL NOT 将其渲染为 custom node

### Requirement: Streaming custom tag 只在结构闭合后提交

系统 SHALL 等待已接入 public custom tag 的 closing tag 到达并满足 standalone block 边界后，才将 occurrence 提交给对应 internal custom tag 和 custom node。未闭合 occurrence SHALL 按当前普通 Markdown 文本处理，SHALL NOT 创建可见 custom node、pending UI、骨架或业务副作用。

#### Scenario: Unclosed intended custom tag remains literal

- **WHEN** streaming assistant text 包含 standalone public custom tag opening 但尚未收到 closing tag
- **THEN** 当前帧 SHALL 不创建对应 custom node
- **AND** SHALL 保留当前协议文本的普通 Markdown 渲染

#### Scenario: Closing tag commits a custom node

- **WHEN** 未闭合 occurrence 收到 closing tag且满足 standalone block 边界
- **THEN** 系统 SHALL 将其切换为对应标签的 candidate
- **AND** 该标签的 semantic validation 成功时 SHALL 渲染对应 custom node

#### Scenario: Final unclosed custom tag stays literal

- **WHEN** assistant message 已 final 但 public custom tag occurrence 仍未闭合
- **THEN** 系统 SHALL 保留其 literal Markdown
- **AND** SHALL NOT 显示 pending 或 invalid custom UI

### Requirement: Structural analysis 与协议 semantic validation 分离

通用 structural analyzer SHALL 只负责源码范围、attrs/body 提取、closed、context、source ordinal 和 candidate/literal，不得解析协议 type、JSON、payload schema、交互状态或持久化状态。每种 public custom tag SHALL 在 candidate 产生后使用自己的 semantic parser 决定 ready/invalid 或该协议定义的其他结果。

#### Scenario: Structural candidate delegates to protocol parser

- **WHEN** structural analyzer 识别出 Fyllo Action 或 Fyllo Signal candidate
- **THEN** analyzer SHALL 原样提供该 occurrence 的 attrs 与 body
- **AND** Action 与 Signal SHALL 分别调用自己的 registry、JSON 和 payload validation

#### Scenario: Semantic invalidity does not change structural disposition

- **WHEN** closed standalone candidate 的 type、JSON 或 payload 对其协议无效
- **THEN** structural disposition SHALL 仍为 candidate
- **AND** 对应协议 semantic parser SHALL 独立产生 invalid result

### Requirement: 多种 custom tag 的 Markstream transport 可组合且互不改变原文

每种接入的 Markstream adapter SHALL 只在 render-only content 中把本协议 candidate 改写为独立 internal tag，并 SHALL 使用互不冲突的 placeholder namespace 无损保留 Markdown 正文中的 literal occurrence。原始 assistant message SHALL NOT 被修改。多个 adapter SHALL 能在同一 assistant text part 中组合，且不得改变其他协议的 identity、状态或副作用。

#### Scenario: Mixed custom-tag candidates all render

- **WHEN** 同一 assistant text part 包含一个 ready Fyllo Action candidate 和一个 ready Fyllo Signal candidate
- **THEN** Markstream SHALL 分别创建对应 internal custom node
- **AND** Action 的 source ordinal、registration 和 identity SHALL 与未引入 Signal 时一致

#### Scenario: Mixed custom-tag literals preserve exact source

- **WHEN** 同一 text part 包含 literal Action、literal Signal 和 ready candidates
- **THEN** 最终 AST SHALL 不包含任何 transport placeholder
- **AND** literal 标签、属性和 JSON 引号 SHALL 与原始 source 一致

#### Scenario: Future adapter uses an isolated transport namespace

- **WHEN** 未来新的 agent-facing public custom tag 接入 Markstream
- **THEN** adapter SHALL 使用唯一 internal tag 和 placeholder namespace
- **AND** SHALL 复用本 capability 的 candidate/literal、commit-on-close 和 source preservation 规则
