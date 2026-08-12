## ADDED Requirements

### Requirement: Chat reminder 注入逐 Folder Proposal 决策契约

FylloCode mode 的 Chat system reminder SHALL 告知 Agent：multi-root 用户目标必须按 Workspace block 中的 Folder identity 分解并独立判断轨道，行为契约变化归拥有权威 contract/spec 的 Folder，依赖方适配留在依赖方并独立判断，达到 Proposal 标准的每个 owner 必须创建独立 Proposal且不得回退 primary。Reminder SHALL 要求 Agent 在调用 tool 前取得用户对明确 Proposal owner 集合的同意，并 SHALL 要求每个 owner 项包含 Folder 名称、使其达到 Proposal 标准的具体行为契约变化和已知跨 repository 依赖或顺序。Reminder SHALL 使用每次 tool 返回的 `state.target.proposalRef` 与 `state.target.worktreePath` 跟踪和写入对应 artifacts；Reminder SHALL NOT 使用不存在的 `state.workspace.path` 作为 Proposal artifact root。Native mode SHALL 继续不注入 FylloCode system reminder。

#### Scenario: Multi-root Chat 收到跨 repository 契约变更

- **WHEN** FylloCode Chat Session 的 Workspace snapshot 包含多个 Folder
- **AND** 用户目标可能改变多个 repository 的行为契约
- **THEN** system reminder SHALL 指导 Agent 先按 Folder 调查并分别应用 Proposal 标准
- **AND** SHALL 指导 Agent 为每个达到标准且经用户确认的 owner 显式传入对应 `folderId`
- **AND** SHALL 明确禁止把跨 repository 契约变更默认归入 primary Folder

#### Scenario: 一次确认覆盖已列出的 owner 集合

- **WHEN** Agent 准备为多个 Folder 创建 Proposal
- **THEN** reminder SHALL 要求 Agent 在调用前列出每个 owner 的 Folder 名称、具体行为契约变化和已知跨 repository 依赖或顺序
- **AND** SHALL 允许用户一次确认该明确集合
- **AND** SHALL 要求新增 owner 在调用前重新取得确认

#### Scenario: Reminder 使用 owner-qualified target state

- **WHEN** 同一 Chat Session 创建或检查多个 Proposal
- **THEN** reminder SHALL 指导 Agent按每次返回的 `state.target.proposalRef` 区分 Proposal identity
- **AND** SHALL 指导 Agent只在对应的 `state.target.worktreePath` 下读写 artifacts
- **AND** 后续指代无法唯一映射到一个 ProposalRef时 SHALL 要求用户明确目标

#### Scenario: Native Chat 不接收决策契约

- **WHEN** Chat Session 使用 native mode
- **THEN** Main SHALL NOT 注入 FylloCode system reminder
- **AND** 本 requirement SHALL NOT 使 native Agent 获得 bundled MCP Proposal workflow 指令
