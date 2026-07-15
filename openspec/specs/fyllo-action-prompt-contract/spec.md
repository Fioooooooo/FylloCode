# fyllo-action-prompt-contract Specification

## Purpose

定义注入到 system-reminder 的 `<fyllo-action-contract>` 静态契约：基于 shared registry 穷举生成 Action type 描述、字段约束与 JSON 示例，要求示例可解析、单字段异常不导致整份契约丢失，并约定 payload 中尖括号的编码方式。

## Requirements

### Requirement: Shared registry defines exhaustive action contracts

系统 SHALL 在 `src/shared/fyllo-action/registry.ts` 中维护编译期穷尽的 Action contract registry，类型为 `Record<FylloActionType, FylloActionContract<FylloActionType>>`。

每个 contract SHALL 包含：

- `type`：Action type；
- `payloadSchema`：对应 type 的 strict Zod schema；
- `presentation`：`"inline" | "rail"`；
- `interaction`：`"confirm"`；
- `prompt`：包含 `purpose`、字段列表、`constraints` 和 `example`。

Renderer UI 使用的 `title`、`icon`、`confirmLabel`、`component` SHALL NOT 进入 shared contract。

#### Scenario: Registry covers all action types

- **WHEN** 新增一个 `FylloActionType`
- **THEN** TypeScript 编译 SHALL 要求同步更新 registry
- **AND** 缺少该 type 的 registry 条目 SHALL 导致类型错误

#### Scenario: UI metadata stays in renderer

- **WHEN** 查看 `src/shared/fyllo-action/registry.ts`
- **THEN** 该文件 SHALL 不包含任何 `icon`、`title` 或 Vue component 引用

### Requirement: prompt.ts renders a stable injectable section

`src/shared/fyllo-action/prompt.ts` SHALL 提供纯函数 `renderFylloActionPromptContract()`，输出可直接注入 system-reminder 的 plain string。

输出 SHALL 包含：

- 全局协议约束（只允许 `type` 属性、body 是 strict JSON、尖括号编码等）；
- Markdown 结构约束：真实 Action 标签块必须独占顶层 Markdown block，前后不得混入解释文字；
- 字面说明约束：解释 public Fyllo Action 标签语法或提供非执行示例时，必须使用 inline code 或 fenced code，禁止把示例作为裸 Action block 输出；
- 按固定顺序列出的每个 enabled action 的 purpose、required/optional fields、constraints 和 example；
- example 使用 `JSON.stringify` 生成，禁止手写不一致 JSON。

`renderFylloActionPromptContract()` SHALL 不依赖 Electron、Vue、AI SDK 或 `TextUIPart`；它只消费开发者维护的静态 registry，SHALL NOT 拼接用户输入、项目路径或会话内容。

#### Scenario: Prompt output is deterministic

- **WHEN** 连续调用 `renderFylloActionPromptContract()`
- **THEN** 两次输出 SHALL 完全相同
- **AND** 输出顺序 SHALL 与 registry 定义顺序一致

#### Scenario: Example is valid JSON

- **WHEN** prompt section 包含某个 Action 的 example
- **THEN** 该 example SHALL 是合法 JSON
- **AND** 它 SHALL 能被对应 payload schema 校验通过

#### Scenario: Prompt explains the standalone block boundary

- **WHEN** 生成 Fyllo Action prompt contract
- **THEN** 输出 SHALL 明确要求真实 Action 独占顶层 Markdown block
- **AND** SHALL 明确要求字面标签说明与非执行示例使用 inline code 或 fenced code

### Requirement: System reminder injects fyllo-action-contract section

Chat system-reminder provider SHALL 调用 `renderFylloActionPromptContract()` 获取 `<fyllo-action-contract>` section，并将其放入完整 system-reminder 的合适位置。

provider 负责 section 顺序和总装，SHALL NOT 在 provider 内复制 Action contract 文案。

#### Scenario: System reminder includes action contract

- **WHEN** Chat system-reminder 构建完成
- **THEN** 输出 SHALL 包含 `<fyllo-action-contract>` 块
- **AND** 该块内容 SHALL 来自 `prompt.ts`

#### Scenario: Provider does not duplicate contract text

- **WHEN** 查看 system-reminder provider 实现
- **THEN** 它 SHALL 只调用 `renderFylloActionPromptContract()`
- **AND** SHALL NOT 硬编码 Action type 描述或示例

### Requirement: Dynamic fields are escaped to protect reminder boundaries

注入 system-reminder 的动态字段（如项目路径、文件路径、标题、summary 等）包含 `<` 或 `>` 时，SHALL 编码为 `\u003c` 和 `\u003e`，SHALL NOT 因单字段异常导致整份 system-reminder 被丢弃。

#### Scenario: Knowledge description contains angle brackets

- **WHEN** knowledge entry `description` 包含 `<script>`
- **THEN** system-reminder 输出 SHALL 包含 `\u003cscript\u003e`
- **AND** 整份 reminder SHALL 仍被正确注入

#### Scenario: Plan slug in prompt is encoded

- **WHEN** 动态字段包含尖括号
- **THEN** 该字段 SHALL 编码后注入
- **AND** 该字段 SHALL 不截断外层 XML 标签

### Requirement: Knowledge candidate summary rejects line breaks

`knowledge.flag` payload schema 中的 `summary` SHALL 拒绝 CR（`\r`）和 LF（`\n`），确保候选摘要是一句话。

候选列表注入 system-reminder 时 SHALL 使用 `JSON.stringify` 生成，SHALL NOT 使用 YAML-like 无引号拼接。

#### Scenario: Multi-line summary is invalid

- **WHEN** `knowledge.flag` payload 的 `summary` 包含换行
- **THEN** schema 校验 SHALL 失败

#### Scenario: Candidate list is JSON encoded

- **WHEN** system-reminder 包含多个 knowledge candidates
- **THEN** 它们 SHALL 以 JSON array/string 形式出现
- **AND** SHALL NOT 使用无引号列表

### Requirement: Empty knowledge index still outputs admission instructions

即使当前项目 knowledge index 为空，Chat system-reminder 中的 `<knowledge>` 块 SHALL 继续输出固定的 knowledge admission 和 flag 规则，SHALL NOT 因索引为空而省略该块。

#### Scenario: Empty knowledge index

- **WHEN** 当前项目没有 knowledge entries
- **THEN** system-reminder SHALL 仍包含 `<knowledge>` 块
- **AND** 该块 SHALL 说明如何创建和 flag knowledge
