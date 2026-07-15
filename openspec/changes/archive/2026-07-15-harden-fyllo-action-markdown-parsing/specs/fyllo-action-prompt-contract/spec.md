## MODIFIED Requirements

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
