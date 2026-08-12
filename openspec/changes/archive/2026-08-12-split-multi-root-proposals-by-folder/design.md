## Context

Workspace v2 已经把 Workspace 与 Folder identity 分离。Chat activation 的 `<workspace>` block 包含完整 Folder 集合，`create-proposal` 在 multi-root descriptor 下要求显式 `folderId`，每次调用返回 owner-qualified `state.target { proposalRef, worktreeMode, worktreePath }`。同一 Session、Task 和 lineage subject 也已经可以关联多个 Proposal。

缺口位于 Chat 阶段的决策策略：`chat.txt` 只要求在行为契约变化时创建 Proposal，却没有规定跨 Folder 需求需要按 repository 分解判断。因此 Agent 可能先选择 primary Folder，再把整个目标写成一个 Proposal。MCP 只能验证调用中给出的 owner 是否获授权，无法从自然语言和跨仓库代码影响推断还有哪些 Folder 也达到 Proposal 门槛。

另外，当前 `chat.txt` 的 workspace policy 仍引用 `state.workspace.path`，而现有 tool/spec 的权威返回形状是 `state.target.proposalRef` 与 `state.target.worktreePath`。这会削弱 Agent 在同一会话中区分多个 Proposal target 的能力。

## Goals / Non-Goals

**Goals:**

- 让 Chat Agent 对 multi-root 需求按授权 Folder 独立判断 Direct、Plan 或 Proposal。
- 让所有达到 Proposal 标准的 repository 获得独立 Proposal，并显式绑定各自 `folderId`。
- 让一次用户确认可以覆盖 Agent 已明确列出的 Proposal owner 集合，同时禁止确认后静默扩大 owner 集合。
- 让每份 Proposal 保持 repository-local，并清楚表达必要的跨 repository 依赖和执行顺序。
- 统一 Chat reminder 与 `create-proposal` instruction 对 tool state 的术语。

**Non-Goals:**

- 不新增批量 `create-proposals` tool，也不修改现有 `create-proposal` input/output。
- 不让 Main 或 MCP 自动判断某个 Folder 是否达到 Proposal 标准。
- 不把一个跨 repository 用户目标拆成多个 Workspace Task；现有单 Task/Session 关联多个 Proposal 的模型保持不变。
- 不修改 Proposal browser、Apply、Archive、lineage、worktree layout 或持久化 schema。
- 不规定跨 Folder Proposal 必须使用相同或不同的 `changeId`；完整 identity 继续由 `ProposalRef` 保证。

## Decisions

### 1. 在 Chat reminder 中承担逐 Folder 轨道判断

在 `src/main/services/session/chat/system-reminder/templates/chat.txt` 的 `OpenSpec Judgment` 增加 multi-root decomposition 规则：先根据用户目标、代码、spec 和 guideline 识别每个 Folder 的 repository-local 改动，再对每个 Folder独立应用现有两道轨道判断。只有该 Folder 自身发生行为契约变化时才进入 Proposal；复杂但不改契约的 Folder 进入 Plan；清晰低风险实现改动可 Direct。

跨 repository 接口调用以权威 contract 或 spec 的 owner 作为契约变化归属：提供方若修改 public API/schema/interface，其 Proposal 属于提供方 Folder；依赖方为消费该变化产生的适配仍属于依赖方 Folder，并按该适配自身是否改变契约与实现复杂度独立判断轨道。该原则不根据调用方向猜测 owner，而以 repository 内实际拥有的权威契约为证据。

选择 prompt policy 而不是运行时自动化，是因为 Proposal 门槛依赖语义事实，例如某项跨仓库调用在一个 repository 中只是适配实现，在另一个 repository 中却改变 public API。MCP descriptor 只提供授权范围，无法证明用户目标对所有 Folder 的完整影响。

### 2. 用户确认绑定明确的 Proposal owner 集合

在调用任何 `create-proposal` 前，Agent 必须向用户列出准备创建 Proposal 的 Folder owner；每项至少包含 Folder 名称、使其达到 Proposal 标准的具体行为契约变化，以及已知的跨 repository 依赖或执行顺序。用户一次明确同意可以授权该已列出的集合，避免为同一收敛结果逐个重复提问。若后续调查发现新的 Folder 也达到 Proposal 标准，必须重新取得对扩展 owner 集合的同意。

这延续现有“显式用户同意”保护，同时让 multi-root 场景具备可操作性。仅有“同意创建一个 Proposal”且未明确跨 Folder owner 集合时，不得解释为授权在任意 Folder 创建多个 Proposal。

### 3. 每个 owner 独立调用现有 tool

Agent 为已确认集合中的每个 Folder 分别调用 `mcp__fyllo_specs__create-proposal`，传入对应 `folderId`。一次调用只拥有一个 `state.target`，artifact 的读写根始终取 `state.target.worktreePath`。同一会话中的多个 target 以完整 `state.target.proposalRef` 区分；后续出现“上一个 change”之类歧义指代时，按现有规则要求用户明确 ProposalRef。

不新增批量 tool，因为独立调用可以保留每个 repository 的 worktree failure、重复 change、artifact instruction 和 event 结果；批量 API 还会引入部分成功回滚语义，而对当前问题没有必要。

### 4. Proposal artifact 保持 repository-local

每份 `proposal.md`、delta spec、`design.md` 和 `tasks.md` 只定义 owner Folder 中需要落地的契约与文件。若完成目标依赖其他 Folder 的 Proposal，当前 Proposal 的 design 必须记录依赖的 `ProposalRef` 或至少明确 owner Folder 与 change，并在 tasks 中标出执行前置关系；不得在当前 tasks 中要求修改另一 Folder 的文件。

该边界保证每个 Proposal 可以由 owner-only Apply/Archive activation安全执行，同时不隐藏跨 repository 的发布或实现顺序。

### 5. 双层提示但不复制判断逻辑

`chat.txt` 是完整的 Chat 决策权威；`src/mcp-servers/fyllo-specs/src/tools/instructions/create-proposal.md` 只增加防御性说明：一次 tool invocation 对应一个 owner，已判断为多 Proposal 时要分别调用。tool instruction 不重新定义 Proposal 门槛、用户确认或轨道规则，避免两份策略漂移。

测试分为两层：system-reminder 测试断言模板和 multi-root 渲染结果包含逐 Folder/禁止 primary umbrella/target tracking 的关键规则；MCP instruction 测试断言 one-owner-per-call 文案存在。既有 `workspace-scope.spec.ts` 已覆盖 multi-root 缺少 `folderId` 不回退 primary，无需修改 resolver 测试。

## Risks / Trade-offs

- [Agent 可能遗漏一个受影响 Folder] → reminder 要求先查阅各 Folder 的代码、spec 和 guideline，并在取得同意前列出 owner-local scope；MCP 继续拒绝无 owner 调用，但无法替代语义调查。
- [同一用户目标产生多个 Proposal，用户理解成本上升] → 一次确认展示完整 owner 集合，每份 Proposal 使用 repository-local scope，并记录跨 Proposal 依赖。
- [prompt 与 tool instruction 文案漂移] → 完整规则只放在 `chat.txt`，tool instruction 仅保留单调用单 owner 的局部不变量，并用静态测试锁定。
- [跨 Proposal Apply 顺序不可自动执行] → 本次只要求 artifacts 明确记录依赖，不改变独立 Apply/Archive lifecycle；需要自动编排时另行提案。
- [过时的 `state.workspace.path` 可能存在于历史会话] → 仅修正新注入 reminder；历史消息保持不可变，不做迁移。

## Migration Plan

1. 更新两个 delta spec，先锁定逐 Folder 判断、owner 集合确认、repository-local artifact 和 reminder 投影要求。
2. 更新 `chat.txt` 的 OpenSpec Judgment、Workspace Policy 与 critical guardrail，并修正 target 字段名。
3. 更新 `create-proposal.md` 的单调用单 owner 说明。
4. 增加 system-reminder 与 MCP instruction focused tests，运行 main/MCP focused Vitest、Node typecheck、lint、format check 和 `git diff --check`。

此变更没有数据或 API 迁移。回滚时可恢复 prompt/instruction 文案与测试；现有 Proposal 数据不受影响。

## Open Questions

无。跨 Folder 拆分边界、用户确认粒度、tool 复用和 artifact owner 范围已在本次讨论中收敛。
