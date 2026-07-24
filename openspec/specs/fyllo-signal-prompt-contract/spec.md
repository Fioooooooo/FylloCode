# fyllo-signal-prompt-contract Specification

## Purpose

TBD - created by archiving change add-fyllo-signal. Update Purpose after archive.

## Requirements

### Requirement: Shared registry 穷尽定义 Signal contracts

系统 SHALL 在 `src/shared/fyllo-signal/registry.ts` 维护编译期穷尽的 `Record<FylloSignalType, FylloSignalContract<FylloSignalType>>`。每个 contract SHALL 包含 type、strict Zod payload schema，以及包含 purpose、payload fields、constraints 和 JSON example 的 prompt metadata。

Renderer component、icon、视觉 class 和交互实现 SHALL NOT 进入 shared contract。

#### Scenario: Registry covers every enabled Signal type

- **WHEN** 新增一个 `FylloSignalType`
- **THEN** TypeScript 编译 SHALL 要求同步增加 registry contract
- **AND** enabled type 列表 SHALL 从 registry 穷尽生成

#### Scenario: Shared contract stays renderer-independent

- **WHEN** 查看 Signal registry
- **THEN** 该模块 SHALL 不导入 Vue、Markstream、Nuxt UI 或 renderer component

### Requirement: Signal prompt 与 Action 共用标签结构和换行规则

`renderFylloSignalPromptContract()` SHALL 使用与 `renderFylloActionPromptContract()` 相同的公共 formatter 生成以下规则：

- 唯一允许的属性是 `type`；
- body 是符合 type schema 的 strict JSON object；
- payload 中的字面尖括号编码为 `\u003c` 和 `\u003e`；
- 真实标签从行首开始并独占顶层 Markdown block；
- opening tag 前若有 prose，必须插入一个空白行；
- closing tag 后若继续 prose，必须插入一个空白行；
- public tag 的说明和非执行示例必须放入 inline code 或 fenced code；
- per-type example 使用 `JSON.stringify` 生成。

Signal formatter SHALL 使用 Signal 名词和 `<fyllo-signal>` 标签；Action formatter SHALL 保持现有输出和顺序不变。

#### Scenario: Prose before and after a Signal has blank lines

- **WHEN** prompt contract 指导 agent 在说明文字之间发出真实 Signal
- **THEN** opening tag 前 SHALL 要求两个 newline 形成空白行
- **AND** closing tag 后继续文字时 SHALL 要求空白行
- **AND** opening 或 closing tag SHALL NOT 与 prose 共享同一行

#### Scenario: Literal tag example is fenced or inline

- **WHEN** agent 解释 Fyllo Signal 语法而不是发出真实 Signal
- **THEN** prompt contract SHALL 要求用 inline code 或 fenced code 包裹示例
- **AND** 裸 standalone 示例 SHALL 被描述为可执行 Signal

#### Scenario: Angle brackets are encoded

- **WHEN** Signal payload string 需要包含字面 `<` 或 `>`
- **THEN** prompt contract SHALL 指导使用 `\u003c` 或 `\u003e`

#### Scenario: Existing Action prompt stays stable

- **WHEN** 公共 prompt formatter 被抽取并由 Action 使用
- **THEN** `renderFylloActionPromptContract()` 的现有输出 SHALL byte-for-byte 保持一致

### Requirement: Chat system-reminder 注入 Signal contract

Chat system-reminder provider SHALL 调用 `renderFylloSignalPromptContract()`，并在现有 `<fyllo-action-contract>` 后追加完整 `<fyllo-signal-contract>` section。provider SHALL NOT 复制公共规则、type purpose、constraints 或 example。

Signal section SHALL 明确说明 Signal 是无需用户操作的被动展示标记，并且不进入 session EventRail。

#### Scenario: Chat reminder includes both contracts

- **WHEN** Chat system-reminder 构建完成
- **THEN** 输出 SHALL 包含完整的 `<fyllo-action-contract>` 和 `<fyllo-signal-contract>`
- **AND** Signal contract SHALL 位于 Action contract 之后

#### Scenario: Provider delegates contract rendering

- **WHEN** 查看 Chat system-reminder provider
- **THEN** provider SHALL 只组合 shared prompt renderer 的返回值
- **AND** SHALL NOT 在 provider 中硬编码 Signal type 或格式规则

### Requirement: show.time contract 使用真实启用 schema 和 example

首版 registry SHALL 启用 `show.time`。其 payload SHALL 是 strict object `{ "label": string }`，其中 `label` 长度为 1 到 200 个 UTF-16 code unit 且不包含 CR/LF。

prompt SHALL 指导 agent 在用户询问当前时间时最多输出一次 `show.time`，example SHALL 能被 JSON parser 和 `show.time` payload schema 校验通过。

#### Scenario: show.time example is parseable

- **WHEN** 从 Signal prompt contract 提取 `show.time` example
- **THEN** example SHALL 是合法 JSON object
- **AND** SHALL 通过 `show.time` payload schema

#### Scenario: Multiline time label is rejected

- **WHEN** `show.time.label` 包含 CR 或 LF
- **THEN** payload schema validation SHALL 失败

### Requirement: Signal prompt contract 保持栈无关

Signal purpose、constraints 和 example SHALL 描述 agent 输出行为，不得引用 Electron、Vue、Markstream、Nuxt UI、FylloCode 源码路径或 renderer 实现。

#### Scenario: Generated contract contains no implementation vocabulary

- **WHEN** 生成 `<fyllo-signal-contract>`
- **THEN** section SHALL 只包含协议规则与 enabled type metadata
- **AND** SHALL 不包含 renderer 技术栈或代码路径
