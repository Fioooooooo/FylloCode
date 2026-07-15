# fyllo-action-markdown-parsing Specification

## Purpose

TBD - created by archiving change harden-fyllo-action-markdown-parsing. Update Purpose after archive.

## Requirements

### Requirement: Fyllo Action candidates use a standalone Markdown block boundary

系统 SHALL 只把位于 Markdown 代码区域之外、独占顶层 Markdown block 且具有 closing tag 的 public Fyllo Action 标签块识别为 Action candidate。

candidate 的 opening tag SHALL 位于文件开头或空白行之后，行首只允许最多三个空格；closing tag 后至该 block 结束只允许空白，且后续 SHALL 为文件结尾或空白行。candidate body 可以跨行；candidate 内部的 attribute、type、JSON 与 payload schema 合法性 SHALL 继续由 Fyllo Action semantic parser 判定。

inline code、fenced code、list、blockquote、正文内联标签、opening tag 前或 closing tag 后存在说明文字的标签块 SHALL 作为 literal Markdown，SHALL NOT 作为 Action candidate。

#### Scenario: Closed standalone action becomes a candidate

- **WHEN** assistant text part 包含一个位于代码区域之外、前后满足空白 block 边界且具有 closing tag 的 Fyllo Action 标签块
- **THEN** 系统 SHALL 将该标签块识别为 Action candidate
- **AND** SHALL 把其 attrs 与 body 交给现有 semantic parser

#### Scenario: Inline code mention stays literal

- **WHEN** public Fyllo Action 标签名出现在 inline code span 中
- **THEN** 系统 SHALL 按 inline code 渲染该内容
- **AND** SHALL NOT 创建 `FylloActionNode`

#### Scenario: Fenced example stays literal

- **WHEN** 一个语法完整且 payload 合法的 Fyllo Action 示例位于 fenced code block 中
- **THEN** 系统 SHALL 按 code block 渲染完整示例
- **AND** SHALL NOT 注册 Action 或创建 EventRail item

#### Scenario: Explanatory prose stays literal

- **WHEN** public Fyllo Action opening tag 前后存在同一 Markdown block 的解释文字
- **THEN** 系统 SHALL 保留并显示原始解释文字与字面标签
- **AND** SHALL NOT 因自动闭合或自定义节点解析吞掉其后文字

#### Scenario: List or blockquote example is not a top-level candidate

- **WHEN** Fyllo Action 标签块位于 Markdown list item 或 blockquote 内
- **THEN** 系统 SHALL 将它作为 literal Markdown
- **AND** SHALL NOT 创建可执行 Action

#### Scenario: Structurally valid but semantically invalid block shows an invalid action

- **WHEN** 一个 closed standalone candidate 的 attribute、type、JSON 或 payload 不符合 Fyllo Action semantic contract
- **THEN** 系统 SHALL 让 semantic parser 返回对应 invalid result
- **AND** Inline UI SHALL 展示现有 invalid Action 状态
- **AND** 系统 SHALL NOT 注册 ready state 或创建 pending EventRail item

### Requirement: Streaming parsing commits actions only after structural closure

系统 SHALL 在流式消息中等待 Fyllo Action 标签块闭合并满足 standalone block 边界后，才把它提交给 `FylloActionNode`。未闭合 occurrence SHALL 按当前 Markdown 字面内容处理，SHALL NOT 创建 pending Action UI、注册 Action state、进入 EventRail 或触发业务副作用。

#### Scenario: Unclosed inline-code prefix does not flash an action

- **WHEN** 流式内容包含尚未收到 closing backtick 的 inline code，且当前前缀中出现 public Fyllo Action opening tag
- **THEN** 系统 SHALL NOT 创建 loading 或 pending `FylloActionNode`
- **AND** closing backtick 到达后 SHALL 正常渲染为 inline code

#### Scenario: Unclosed intended action remains literal during streaming

- **WHEN** 流式内容以一个 standalone Fyllo Action opening tag 开始但尚未收到 closing tag
- **THEN** 系统 SHALL 按字面 Markdown 处理当前前缀
- **AND** SHALL NOT 注册或投影该 occurrence

#### Scenario: Closing tag commits a ready action

- **WHEN** 前一流式帧中的未闭合 occurrence 收到 closing tag、满足 standalone block 边界且通过 semantic validation
- **THEN** 系统 SHALL 将它切换为 ready Action UI
- **AND** SHALL 按现有 registration contract 注册该 Action

#### Scenario: Final unclosed tag stays non-action text

- **WHEN** assistant message 已 final 但一个 Fyllo Action occurrence 仍未闭合
- **THEN** 系统 SHALL 将该 occurrence 保留为 literal Markdown
- **AND** SHALL NOT 为其创建 Action state

### Requirement: All Action consumers share one Markdown analysis

Inline Markstream adapter、EventRail pending projection 与 action ordinal resolver SHALL 消费同一个基于原始 assistant text part 的 Fyllo Action Markdown analysis，SHALL NOT 各自使用独立正则重新判断 candidate。

只有 analysis 标记为 candidate 且 semantic parser 返回 `ready` 的 occurrence 才可注册或进入 EventRail。Inline 与 EventRail 对同一 occurrence 的 type、payload 和 action ID SHALL 一致。

#### Scenario: Literal occurrence is excluded everywhere

- **WHEN** analysis 将某个 public tag occurrence 标记为 literal
- **THEN** Inline SHALL 不渲染 Action 卡片
- **AND** EventRail SHALL 不包含该 occurrence
- **AND** Main SHALL 不收到该 occurrence 的 registration

#### Scenario: Ready candidate has matching Inline and EventRail identity

- **WHEN** analysis 将 occurrence 标记为 candidate 且 semantic parser 返回 ready
- **THEN** Inline 与 EventRail SHALL 使用相同 `sourceOrdinal` 构造 action ID
- **AND** 两者 SHALL 暴露相同的 Action type 与 payload

### Requirement: Source ordinal remains compatible with existing positional action IDs

`sourceOrdinal` SHALL 继续按原始 assistant text part 中 public Fyllo Action opening-tag occurrence 的源码顺序从零编号，包括位于 ready candidate 之前的 literal occurrence。系统 SHALL NOT 因新增 Markdown candidate 过滤而重新压缩 ordinal，也 SHALL NOT 迁移既有 session meta action records。

#### Scenario: Literal example before action preserves later ordinal

- **WHEN** 一个 literal public opening-tag occurrence 位于 ready candidate 之前
- **THEN** ready candidate 的 `sourceOrdinal` SHALL 计入该 literal occurrence
- **AND** 其位置型 action ID SHALL 与旧版源码顺序算法一致

#### Scenario: Existing persisted state still resolves

- **WHEN** session meta 已包含按旧版源码顺序构造的 action ID
- **AND** 对应原始 message text 未改变
- **THEN** 新分析器 SHALL 为该 ready candidate 生成相同 action ID
- **AND** Inline SHALL 读取到现有 persisted state
