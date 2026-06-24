## ADDED Requirements

### Requirement: Assistant 连续工具调用折叠展示

系统 SHALL 在渲染 assistant 消息时，将 `message.parts` 中相邻的两个及以上 tool part 派生为一个可展开的工具调用组。工具调用组仅是渲染层派生结果，系统 SHALL NOT 修改、过滤、重排或回写 `message.parts`。

连续工具调用的判定规则如下：

- 使用 `ai` 包的 `isToolUIPart(part)` 判断 tool part。
- 当扫描到连续 tool part 且连续数量大于等于 2 时，渲染一个工具调用组。
- 当连续数量为 1 时，仍按现有单个 `UChatTool` 方式渲染。
- 任意非 tool part（包括 text、reasoning、file、data、step-start 或未来未知 part）都会打断当前工具调用组。
- 展开状态 SHALL 只保存在当前渲染实例内，不写入 `UIMessage`、session meta 或任何持久化文件。

工具调用组折叠态 SHALL 显示类似单个 `UChatTool` 的面板样式，并展示一段英文概况文案。概况文案 SHALL 从组内 tool part 的 `toolMetadata.toolKind` 统计生成；缺失、非字符串、空字符串或未识别的 `toolKind` SHALL 按 `other` 统计。统计项之间使用 `, ` 分隔，并按组内首次出现的 kind 顺序排列。

初始 kind 文案映射如下：

| toolKind  | 单数文案        | 复数文案           |
| --------- | --------------- | ------------------ |
| `read`    | `Read 1 file`   | `Read {n} files`   |
| `write`   | `Write 1 file`  | `Write {n} files`  |
| `edit`    | `Edit 1 file`   | `Edit {n} files`   |
| `search`  | `Search 1 tool` | `Search {n} tools` |
| `execute` | `Run 1 command` | `Run {n} commands` |
| `other`   | `Run 1 tool`    | `Run {n} tools`    |

工具调用组展开后 SHALL 按原始顺序展示组内每个 tool part，并复用现有单个工具调用的展示逻辑：`UChatTool`、`isToolStreaming(part)`、`getToolText(part)`、`getToolSuffix(part)` 与 `getToolOutput(part)` 的语义保持不变。

Fyllo action 的定位语义 SHALL 保持不变：assistant text part 调用 `buildActionContext(partIndex)` 时，`partIndex` 必须是该 part 在原始 `message.parts` 中的下标。工具调用分组 SHALL NOT 使用 render group 的循环下标替代原始 part index。

#### Scenario: 连续两个工具调用折叠为一个工具组

- **WHEN** assistant 消息的 `parts` 顺序为 `[tool(read), tool(write)]`
- **AND** 两个 tool part 分别携带 `toolMetadata.toolKind === "read"` 与 `"write"`
- **THEN** UI 渲染一个折叠的工具调用组
- **AND** 工具组折叠态文案为 `Read 1 file, Write 1 file`
- **AND** 不单独渲染两个顶层 `UChatTool` 面板

#### Scenario: 工具组展开后展示原工具详情

- **WHEN** assistant 消息中存在一个折叠工具调用组
- **AND** 用户展开该组
- **THEN** 组内每个工具按原始顺序渲染
- **AND** 每个工具继续使用 `getToolText(part)`、`getToolSuffix(part)`、`getToolOutput(part)` 的现有结果

#### Scenario: 缺少 toolMetadata 的历史工具调用降级为 Run

- **WHEN** assistant 消息的 `parts` 顺序为 `[tool(no metadata), tool(no metadata)]`
- **THEN** UI 渲染一个折叠的工具调用组
- **AND** 工具组折叠态文案为 `Run 2 tools`
- **AND** 展开后仍展示两个历史工具调用的原始详情

#### Scenario: 单个工具调用不折叠

- **WHEN** assistant 消息的 `parts` 顺序为 `[text, tool(read), text]`
- **THEN** 该 tool part 按现有单个 `UChatTool` 方式渲染
- **AND** UI 不为单个 tool 创建工具调用组

#### Scenario: 非 tool part 打断工具分组

- **WHEN** assistant 消息的 `parts` 顺序为 `[tool(read), text, tool(write)]`
- **THEN** 两个 tool part 不会被合并进同一个工具调用组
- **AND** text part 按原始位置渲染在两个 tool 之间

#### Scenario: Fyllo action partIndex 使用原始 parts 下标

- **WHEN** assistant 消息的 `parts` 顺序为 `[text(action-a), tool(read), tool(write), text(action-b)]`
- **AND** 连续两个 tool part 被渲染为一个工具调用组
- **THEN** 第一个 text part 调用 `buildActionContext(0)`
- **AND** 第二个 text part 调用 `buildActionContext(3)`
- **AND** 系统不得使用渲染组下标 `0` 或 `2` 替代原始 `partIndex`

#### Scenario: 混合已知与未知工具类别

- **WHEN** assistant 消息的连续工具组包含 `toolMetadata.toolKind === "read"`、缺少 `toolMetadata.toolKind`、`toolMetadata.toolKind === "read"` 三个工具
- **THEN** 工具组折叠态文案为 `Read 2 files, Run 1 tool`
