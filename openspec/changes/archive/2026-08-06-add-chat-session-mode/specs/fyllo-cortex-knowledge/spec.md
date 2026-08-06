## MODIFIED Requirements

### Requirement: Chat reminders inject a compact knowledge index

系统 SHALL在 `fyllocode` Chat system-reminder中注入 `<knowledge>`块，供 Agent了解当前 Workspace durable knowledge index与 flag规则。`native` Chat SHALL NOT为 prompt扫描或注入该 knowledge index；该限制 SHALL NOT删除 knowledge文件、改变 Knowledge Browser或禁止用户在其他 FylloCode流程中显式使用 knowledge能力。

`<knowledge>`块 SHALL包含：

- knowledge root的读取位置；
- knowledge是记录和证据而非 live instruction的说明；
- 读取 `suspect`或 `unknown`条目前必须验证的说明；
- flag test和常见触发线索；
- 按 `project`、`reference`、`feedback`分组的紧凑索引；

索引项 SHALL只包含 `name`、`description`和可选 status marker，不注入完整 anchors/source/body。

#### Scenario: Active entry appears without status marker

- **WHEN** `fyllocode` Chat system-reminder构建 knowledge index，且某条 entry computed status为 `active`
- **THEN** `<knowledge>`块 SHALL展示该 entry的 `name`和 `description`
- **AND** 该 index行 SHALL NOT附加 `suspect`或 `unknown`标记

#### Scenario: Suspect entry appears with marker

- **WHEN** `fyllocode` Chat system-reminder构建 knowledge index，且某条 entry computed status为 `suspect`
- **THEN** `<knowledge>`块 SHALL在该 index行展示 `[suspect]`
- **AND** reminder SHALL要求 Agent在依赖该条目前验证当前事实

#### Scenario: User-authored text is escaped

- **WHEN** knowledge frontmatter `description`或其他注入字段包含 `<`或 `>`
- **THEN** system-reminder SHALL将尖括号编码为 JSON-safe escape
- **AND** 该文本 SHALL NOT能关闭 `<knowledge>`、`<system-reminder>`或 `<fyllo-action>`标签

#### Scenario: Native Chat skips knowledge reminder

- **WHEN** `native` Chat在 brand-new ACP session发送首轮 prompt
- **THEN** Main SHALL NOT为 prompt injection扫描 knowledge index
- **AND** prompt SHALL NOT包含 `<knowledge>`块或 knowledge flag规则
- **AND** 当前 Workspace已有 knowledge文件 SHALL保持不变
