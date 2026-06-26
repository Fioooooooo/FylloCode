## ADDED Requirements

### Requirement: 主进程读取 proposal specs delta

主进程 SHALL 提供 `proposal:getSpecDeltas` IPC handler，接收 `{ projectId, changeId }`，通过 `loadProject(projectId)` 还原项目路径后，使用既有 change 定位逻辑解析当前 proposal 目录，并读取该目录下的 `specs/*/spec.md`。该 handler SHALL 返回 `IpcResponse<ProposalSpecDeltaOverview>`。

`ProposalSpecDeltaOverview` SHALL 定义在 `src/shared/types/proposal.ts`，结构如下：

- `items: ProposalSpecDeltaItem[]`

`ProposalSpecDeltaItem` SHALL 包含：

- `id: string`：capability 目录名。
- `purpose: string`：从 `## Purpose` 解析出的文本；delta spec 没有 Purpose 时为空字符串。
- `sourcePath: string`：相对 proposal 目录的路径，格式为 `specs/<capability>/spec.md`。
- `deltaTypes: ProposalSpecDeltaType[]`：该 capability 中出现过的 delta 类型，按 `ADDED`、`MODIFIED`、`REMOVED`、`RENAMED` 顺序去重。
- `requirementsCount: number`：解析出的 requirement 数量。
- `scenariosCount: number`：解析出的 scenario 数量。
- `requirementGroups: ProposalSpecDeltaRequirementGroup[]`

`ProposalSpecDeltaType` SHALL 为 `"ADDED" | "MODIFIED" | "REMOVED" | "RENAMED"`。

`ProposalSpecDeltaRequirementGroup` SHALL 包含：

- `deltaType: ProposalSpecDeltaType`
- `title: string`
- `body: string`
- `scenarios: ProposalSpecDeltaScenarioGroup[]`

`ProposalSpecDeltaScenarioGroup` SHALL 包含：

- `title: string`
- `body: string`

主进程 SHALL 识别以下 delta section 标题：

- `## ADDED Requirements`
- `## MODIFIED Requirements`
- `## REMOVED Requirements`
- `## RENAMED Requirements`

只有位于这些 section 下的 `### Requirement:` block SHALL 进入结果。`#### Scenario:` 仍按现有 specs parser 规则解析为 scenario。`REMOVED` 和 `RENAMED` requirement 允许没有 scenario；`ADDED` 和 `MODIFIED` requirement 即使缺 scenario 也 SHALL 返回该 requirement，并由 OpenSpec 校验流程负责发现规范质量问题。

#### Scenario: 读取 proposal specs delta

- **WHEN** renderer 调用 `proposal:getSpecDeltas`，传入有效 `projectId` 和 `changeId`
- **AND** change 目录下存在 `specs/proposal-detail/spec.md`
- **THEN** 主进程返回 `items` 包含 id 为 `proposal-detail` 的 `ProposalSpecDeltaItem`
- **AND** `sourcePath` 为 `specs/proposal-detail/spec.md`
- **AND** `deltaTypes` 包含该文件实际出现的 delta 类型

#### Scenario: specs 目录不存在

- **WHEN** change 目录下不存在 `specs/`
- **THEN** `proposal:getSpecDeltas` 返回 `{ items: [] }`
- **AND** 不报错

#### Scenario: capability spec.md 缺失

- **WHEN** `specs/foo/` 目录存在但缺少 `spec.md`
- **THEN** 主进程跳过该 capability
- **AND** 其他 capability 仍正常返回

#### Scenario: archived proposal id 映射

- **WHEN** renderer 传入 archived proposal id `YYYY-MM-DD-foo`
- **THEN** 主进程 SHALL 使用现有 change 定位逻辑找到 archive 目录
- **AND** 读取该 archived proposal 内的 `specs/*/spec.md`

#### Scenario: projectId 无法解析

- **WHEN** 传入的 `projectId` 无法解析为有效项目路径
- **THEN** 返回 `{ ok: false, error }`，错误码为 `PROJECT_NOT_FOUND`

#### Scenario: 入参校验失败

- **WHEN** 入参缺少 `projectId` 或 `changeId`，或任一字段为空字符串
- **THEN** 返回 `{ ok: false, error }`，错误码为 `VALIDATION_ERROR`
