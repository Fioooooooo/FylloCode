## ADDED Requirements

### Requirement: Multi-root 用户目标按 Folder 独立拆分 Proposal

Chat Agent SHALL 先按授权 Workspace descriptor 中的 Folder owner 分解跨 repository 用户目标，并 SHALL 对每个 Folder 的 repository-local 改动独立应用 Direct、Plan 或 Proposal 判断。每个自身达到 Proposal 标准的 Folder SHALL 拥有独立 Proposal，Agent SHALL 为其单独调用 `create-proposal` 并显式传入该 Folder 的 `folderId`；系统 SHALL NOT 把多个 repository 的契约变更合并为 primary Folder 或任一其他 Folder 拥有的 umbrella Proposal。未达到 Proposal 标准的 Folder SHALL 继续按其自身改动性质使用 Direct 或 Plan，不得仅因同一用户目标中的其他 Folder 需要 Proposal 而被强制升级。

跨 repository 接口依赖中的行为契约变化 SHALL 归属拥有权威 contract 或 spec 的 Folder；依赖方为消费该变化产生的适配 SHALL 保留在依赖方 Folder，并 SHALL 按该适配自身是否改变契约及实现复杂度独立判断轨道。

#### Scenario: 两个 Folder 都改变行为契约

- **WHEN** 一个已收敛的用户目标要求 Folder A 与 Folder B 分别改变各自 repository 的行为契约
- **THEN** Agent SHALL 提议创建两个独立 Proposal，并在用户同意后分别以 Folder A 与 Folder B 的 `folderId` 调用 `create-proposal`
- **AND** 每次调用 SHALL 返回各自 owner-qualified `ProposalRef` 与 target
- **AND** Agent SHALL NOT 只在 primary Folder 或任一单独 Folder 创建覆盖两边改动的 Proposal

#### Scenario: 只有一个 Folder 达到 Proposal 标准

- **WHEN** 用户目标在 Folder A 改变行为契约，而 Folder B 只需要保持契约的内部实现调整
- **THEN** Agent SHALL 只为 Folder A 创建 Proposal
- **AND** Folder B SHALL 根据其实现复杂度使用 Direct 或 Plan
- **AND** Folder B SHALL NOT 因 Folder A 的轨道选择而自动进入 Proposal

#### Scenario: 提供方契约变化与依赖方适配分属不同 Folder

- **WHEN** Folder A 拥有权威 public API contract 并修改该契约
- **AND** Folder B 只需适配对该 API 的调用
- **THEN** 契约变化 SHALL 归入 Folder A 的 Proposal 判断与 artifact scope
- **AND** Folder B 的适配 SHALL 保留在 Folder B，并按其自身契约影响和复杂度独立选择 Direct、Plan 或 Proposal
- **AND** Agent SHALL NOT 因调用方向或 Workspace primary 将两边改动归入同一 owner

#### Scenario: 用户确认包含可审查信息的 Proposal owner 集合

- **WHEN** Agent 已向用户列出准备创建 Proposal 的 Folder 名称、使其达到 Proposal 标准的具体行为契约变化，以及已知跨 repository 依赖或执行顺序
- **AND** 用户明确同意该集合
- **THEN** Agent MAY 依次为该集合中的每个 Folder 调用 `create-proposal`，无需为同一已确认集合逐个重复请求同意
- **AND** 后续发现新的 Folder 也达到 Proposal 标准时，Agent SHALL 在为新增 owner 调用 tool 前取得用户对扩展集合的明确同意

#### Scenario: 每份 Proposal 保持 repository-local

- **WHEN** 一个用户目标由多个 Folder 的独立 Proposal 共同实现
- **THEN** 每份 Proposal 的 proposal、spec、design 与 tasks SHALL 只要求修改其 owner repository 的契约和文件
- **AND** 跨 repository 依赖或执行顺序 SHALL 在相关 design/tasks 中显式记录
- **AND** 当前 Proposal SHALL NOT 把另一 Folder 的文件修改任务归入自身 Apply 范围

#### Scenario: 单次 create 调用只处理一个 owner

- **WHEN** 已确认的 Proposal 集合包含多个 Folder
- **THEN** Agent SHALL 为每个 Folder 分别调用现有 `create-proposal` tool
- **AND** 每次调用 SHALL 使用该 owner 的 `folderId` 并只产生一个 `state.target`
- **AND** 系统 SHALL NOT 通过选择 primary Folder、批量推断 owner 或 caller path 合并这些调用
