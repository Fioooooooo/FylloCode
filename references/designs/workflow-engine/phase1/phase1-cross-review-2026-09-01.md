# Workflow Engine Phase 1 交叉评审记录（2026-09-01）

## 文档定位

本文档记录本次 `claude-acp` 与 `kimi-code` 对 Workflow Engine Phase 1 的交叉方案评审过程，同时承载本次评审形成的设计补充。它不进入实现授权流程；已经确认的设计结论按本次任务范围记录在本文档，并同步不涉及行为契约的文档调整。

本次评审沿用既有 [phase1-blocker-decision-log.md](phase1-blocker-decision-log.md) 中的 B1–B7 作为初始议题，但不预设其结论正确，也不覆盖该历史记录。

## 参与方

- **主持人：Codex**：核对仓库事实和规范，限定议题范围，组织有界讨论，记录并同步结论。
- **Claude ACP**：独立方案评审方，重点检查架构、契约一致性和边界风险。
- **Kimi Code**：独立方案评审方，重点检查实施可行性、运行时风险和验收闭环。
- **用户**：对达到 5 轮仍未收敛的 Phase 1 阻塞问题作最终决策。

## 评审范围

只评审 Phase 1：

- 手写 YAML workflow 的保存和定义态校验。
- `Agent(fresh, freeform)`、`Action(exec)`、`Gate(human)` 及 Transition/maxLoops 的运行语义。
- 主进程 Run 调度、持久化、并发、重启、父 Session 删除和应用 shutdown 生命周期。
- workflow 独立 ACP fresh runner 与用户可见的 workflow run 展示。
- `fyllo-workflow` MCP、bundled MCP Host RPC、workflow IPC 和 Renderer wake/pull 边界。

Phase 2/Phase 3 内容不展开；只有在其直接阻塞 Phase 1 时才作为边界记录。

## 评审规则

1. 只有会阻塞 Phase 1 实施或最小验收路径的问题，才进入正式讨论。
2. 每个问题最多 5 轮；每轮必须记录发言人、观点、证据和主持人判断。
3. 形成可执行、可验证的共识后立即停止该问题的讨论。
4. 第 5 轮结束仍未收敛，标记为“待用户决策”，列出互斥选项、影响和需要用户选择的内容。
5. 发现的偏好性、可延期或 Phase 2/3 问题记录在“非阻塞/超出范围”中，不进入无限发散。
6. 评审期间不修改业务代码；不调用 Apply/Archive。
7. 触及公开 API、schema、持久化格式、用户可见行为或跨模块所有权边界的结论，在本文档中作为设计补充完整记录；本次不进入 Proposal、Apply 或业务实现流程。

## 评审基线

| 材料                                                             | 用途                                             |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| [phase1-execution-design.md](phase1-execution-design.md)         | Phase 1 运行态设计与粗粒度验收标准               |
| [definition-schema.md](definition-schema.md)                     | Workflow 定义态 schema、解析校验和未来能力边界   |
| [phase1-blocker-decision-log.md](phase1-blocker-decision-log.md) | 2026-08-31 单 Agent 历史讨论，不作为本次结论     |
| `openspec/specs/workspace-automation-storage/spec.md`            | Workflow Workspace-owned 存储约束                |
| `openspec/specs/application-lifecycle-orchestration/spec.md`     | 启动、shutdown 和 workflow 入口生命周期约束      |
| `openspec/specs/domain-architecture-contract/spec.md`            | domain、IPC、持久化兼容性约束                    |
| `guidelines/Architecture.md`                                     | 顶层进程和跨进程边界                             |
| `guidelines/MainProcess.md`                                      | Main service、IPC、MCP、存储和生命周期边界       |
| `guidelines/RendererProcess.md`                                  | Renderer API、store、bootstrap 和 scope 生命周期 |
| `guidelines/UiDesign.md`                                         | workflow 页面、状态展示和可访问性约束            |
| `guidelines/Testing.md`                                          | 测试位置、Vitest project 和验证约束              |

## 主持人基线预检（待交叉评审核实）

- 当前 Workflow 实现仍使用 `version: 1`、按名称保存的 YAML 文件和旧的 `WorkflowStage.type`；Phase 1 设计要求 `version: 2`、随机 `workflowId` 目录、状态机 Stage 和 Run 快照。这是已确认的实施差异，是否构成阻塞及其契约影响待评审确认。
- 当前已有 Workflow IPC 位于 `automation:workflow:*`，而 Phase 1 设计示例使用 `workflow:run:*`。项目架构要求跨进程 channel 使用 `<domain>:<area>:<action>`，因此新 Run channel 的 domain/area 归属需要明确，不能直接照搬示例字符串。
- 当前 bundled MCP Host 的 RPC handler 类型与 `fyllo-spawn` 请求绑定，Phase 1 设计要求 server-neutral envelope 和 per-server codec；这需要核对是否能在不破坏现有 `fyllo-spawn` 契约的情况下扩展。
- 当前 shutdown/runtime wiring 没有 WorkflowEngine 的启动、quiesce、dispose 和父 Session 删除入口；Phase 1 设计要求其成为受生命周期管理的主进程资源，具体接入顺序和工作区扫描来源待评审确认。

## 议题总表

“轮次”按该问题的主持提问及对应 Agent 回复计数，范围为 `0/5` 至 `5/5`。

| 编号 | 议题                                                      | 初始来源                           |                 轮次 | 状态               | 设计同步               |
| ---- | --------------------------------------------------------- | ---------------------------------- | -------------------: | ------------------ | ---------------------- |
| B1   | Phase 1 支持的 YAML / Stage / Artifact / Gate 子集        | 历史记录，经双方初审复核           | 历史 4/5；本轮未重开 | 已结论（复核）     | 已同步（历史）         |
| B2   | 决策、信号与 Renderer 唤醒/拉取通道                       | 历史记录，经双方初审复核           | 历史 3/5；本轮未重开 | 已结论（复核）     | 已同步（历史）         |
| B3   | `requires`、模板变量与运行上下文来源                      | 历史记录，经双方初审复核           | 历史 3/5；本轮未重开 | 已结论（复核）     | 已同步（历史）         |
| B4   | ACP fresh/inherit 执行语义与重启恢复                      | 历史记录，经双方初审复核           | 历史 4/5；本轮未重开 | 已结论（复核）     | 已同步（历史）         |
| B5   | Run 持久化、并发、原子推进与生命周期                      | 历史记录，经双方初审复核           | 历史 4/5；本轮未重开 | 已结论（复核）     | 已同步（历史）         |
| B6   | Action 执行器、确认、失败、重试与幂等契约                 | 历史记录，经双方初审复核           | 历史 3/5；本轮未重开 | 已结论（复核）     | 已同步（历史）         |
| B7   | `fyllo-workflow` MCP、IPC domain 与现有 MCP Host 边界     | 历史记录，经双方初审复核           | 历史 4/5；本轮未重开 | 已结论（复核）     | 已同步（历史）         |
| N1   | Workflow Run IPC 的 domain 归属与命名                     | Claude ACP + Kimi Code             |                  1/5 | 已结论             | 已同步（仅命名规范化） |
| N2   | WorkflowEngine 在 shutdown phases 中的接入位置            | Claude ACP 初审，经 Kimi Code 复核 |                  0/5 | 非阻塞（实施约束） | 待实现核对             |
| N3   | Workflow fresh session 的 ID 命名空间与生成时机           | Claude ACP 初审，经 Kimi Code 复核 |                  0/5 | 非阻塞（实施约束） | 待实现核对             |
| N4   | `trigger_workflow` 获取可信 `parentSessionId` 的 RPC 契约 | Claude ACP 初审，经 Kimi Code 复核 |                  0/5 | 非阻塞（实施约束） | 待实现核对             |
| N5   | fresh runner 与 Action `cwd` 的 Workspace snapshot 来源   | Claude ACP 初审，经 Kimi Code 复核 |                  0/5 | 非阻塞（实施约束） | 待实现核对             |
| N6   | Run 快照中 `workflowVersion` 的版本语义                   | Claude ACP + Kimi Code             |                  2/5 | 已结论（设计补充） | 已记录在本文档         |
| N7   | Workflow fresh 子 Session 是否可递归触达 `fyllo-workflow` | Claude ACP + Kimi Code             |                  4/5 | 已结论（设计补充） | 已记录在本文档         |

新增议题使用 `N1`、`N2`……编号，并必须在进入讨论前补充 Phase 1 阻塞证据和影响面。

## 交叉评审任务状态

| Agent      | 任务                                                   | 状态   | Session                                |
| ---------- | ------------------------------------------------------ | ------ | -------------------------------------- |
| Claude ACP | 独立检查架构/契约一致性，只报告 Phase 1 阻塞问题       | 已完成 | `5582f33d-96ad-4e7e-aa00-39ec165c787f` |
| Kimi Code  | 独立检查实施可行性/运行时风险，只报告 Phase 1 阻塞问题 | 已完成 | `681beca3-ae8a-4389-adc9-1c5a71e8b5c6` |

补充：Kimi Code 首次会话 `205ae4ce-d3a0-4335-b800-610feded409f` 因 `TURN_INACTIVITY_TIMEOUT` 未产生报告，不计入评审意见；已用更小的只读核查范围重新派发。

## 第二方独立意见：Kimi Code

状态：已完成；以下是 Kimi Code 对 Claude 候选问题的实现核查摘要。该报告已确认终态并读取，未修改仓库。

- **总体判断**：当前代码基底具备支撑 Phase 1 的若干基础能力；N1 和 N6 是真正的阻塞项，N2/N3/N4 可由既有实现模式支撑，N5 降为实施约束。
- **N1：确认阻塞**。现有 `automation:workflow:*` 和固定六个 domain 证明 `workflow:run:*` 不能直接落地；必须先确定 channel、shared contract、preload 和 handler 归属。
- **N2：驳回为独立阻塞**。`shutdown.ts` 已有声明式 `SHUTDOWN_PHASES` 和集中 runtime wiring；只需在实现时登记 WorkflowEngine 的 quiesce/settle/terminate/force 任务，并同步 emergency 路径。
- **N3：驳回为独立阻塞**。`AcpSession` 已注入逻辑 session ID、store 和 owner，workflow owner 的扩展属于预期实现工作；不需要额外发明带前缀 ID，前提是保持独立 owner/registry 语义。
- **N4：驳回为独立阻塞**。bundled MCP Host 已注入 Workspace descriptor，`fyllo-spawn` 已从可信 context 得到 caller；workflow RPC 可复用该机制，设计只需补充明确说明。
- **N5：降为实施约束**。父 Session 的冻结 snapshot 和 `ensureSessionWorkspaceSnapshot` 已存在；automation 跨 domain 取该能力时应通过 `session/_public` 窄出口，不能直接穿透 service 内部。
- **N6：确认阻塞并建议重写**。当前保存允许覆盖 definition，而 Run 只记录 `workflowId`；重启时可能读取已编辑的 definition，导致 `currentStageId`/`visitCounts` 与定义不匹配。Run 创建时必须冻结定义（内嵌快照或内容哈希加可恢复内容），并明确 `workflowVersion` 与 snapshot schema 的区别。
- **N7：新增阻塞**。现有 `AcpSession` 默认通过 `createBundledMcpActivation` 获得 bundled server；新增 `fyllo-workflow` 后，workflow fresh agent 可能再次调用 `trigger_workflow`，绕过“Run 归属 chat session”的约束并递归创建 Run。必须明确 workflow owner 的 MCP allowlist 或拒绝非 chat caller。

## 主持人初步裁剪

在双方意见交叉后，正式讨论暂限于 **N1、N6、N7**。N2–N5 不作为独立阻塞议题，但其实施约束会在最终设计同步清单中保留；B1–B7 等待这三项讨论完成后再确定最终状态。

## 第一方独立意见：Claude ACP

状态：已完成；以下是 Claude ACP 返回的独立初审摘要。N1–N6 尚未计入讨论轮次，需等待 Kimi Code 交叉核对后由主持人决定是否正式登记。

- **总体判断**：B1–B7 的方向基本可行，未发现需要重开既有 B 议题的直接证据；发现 6 个可能阻塞实施的契约/边界缺口。
- **N1（与 guideline 冲突）**：设计 §6.2 使用 `workflow:run:*`，但 `Architecture.md`/`MainProcess.md` 要求固定 domain 下的 `<domain>:<area>:<action>`；建议 workflow run 归入 `automation`，使用 `automation:workflow-run:*`，并明确 preload/handler 文件归属。
- **N2（与生命周期 guideline 的接入缺口）**：设计 §10.1 要求 WorkflowEngine 在 ACP/辅助进程终止前清理，但没有在 `SHUTDOWN_PHASES` 中明确 `quiesce`、settle、terminate/force 的位置、幂等 API 和总 deadline 下的资源处理；该缺口会阻塞 shutdown 验收。
- **N3（设计内部未定义）**：`agentSessionState.sessionId` 的命名空间、生成时机和与 chat/spawned session 的隔离方式未定义；建议使用独立 registry/命名空间并在 AgentStage 启动前持久化可追踪 ID。
- **N4（设计内部未定义）**：`trigger_workflow` 工具输入只有 `workflowId`，但 Run 归属和并发限制要求可信 `parentSessionId`；需要像 `fyllo-spawn` 一样明确 workflow RPC 的 caller context、类型/schema 和 bridge。
- **N5（设计内部不一致）**：Action `cwd` 依赖 parent session Workspace snapshot，而 fresh runner 又使用独立 session store；需明确 fresh ACP 和 exec 的 snapshot 来源、时点和 stale 处理。
- **N6（设计内部未定义）**：Run 快照的 `workflowVersion: 2` 与 YAML definition `version: 2` 的语义混用；需区分 definition version 与 snapshot schema version，并定义 Phase 1 重启遇到不兼容快照时的处理。

Claude ACP 将 Workflow 编辑器细节、错误文案、debounce 时长、能力预检算法等列为非阻塞或可由现有文档推导的事项；这些暂不进入正式讨论。

## 讨论记录

### N1 — Workflow Run IPC 的 domain 归属与命名

**阻塞依据**：设计 §6.2 的 `workflow:run:*` 不符合现行固定 domain 与 `<domain>:<area>:<action>` 约束，且会直接阻塞 Run 展示和人工决策 IPC 的契约落地。
**影响范围**：shared channel/schema、main IPC handler、preload API、renderer wrapper/store 和 workflow run UI。
**状态**：已结论
**轮次**：1/5

#### 第 1 轮

- **发言人**：Codex（主持人）
- **观点与证据**：要求两位 Agent 在 `automation` domain 及其 area 内给出四个完整 channel、文件归属，并判断是否触及公开契约/Proposal 门槛；依据 `guidelines/Architecture.md`、`guidelines/MainProcess.md`、`openspec/specs/domain-architecture-contract/spec.md` 与现有 `src/shared/ipc/automation/workflow.channels.ts`。
- **Claude ACP**：推荐归入 `automation/workflow-run`，使用 `automation:workflow-run:list/getDetail/decide/wake`；shared、main IPC、preload 和 renderer 均放在对应 automation 路径。认为这是对新增能力的规范化，不改变既有 workflow definition 契约，因此不单独升级 Proposal。
- **Kimi Code**：推荐完全采用 `automation` domain、`workflow-run` area，使用同样的四个 channel：`automation:workflow-run:list`、`automation:workflow-run:getDetail`、`automation:workflow-run:decide`、`automation:workflow-run:wake`。shared、main IPC、preload 和 renderer 的文件边界与 Claude ACP 建议一致；依据固定六域约束、现有 workflow IPC 的 automation 归属及 spawned-session inspection 的 area 组织方式。原设计路径尚未实现，因此这是规范化而非修改既有行为。
- **主持人判断**：两位 Agent 给出完全一致的 domain、area、channel 和文件边界，N1 在第 1 轮达成一致。

#### 最终决定

- **决定**：Run IPC 归入 `automation` domain，area 固定为 `workflow-run`；Phase 1 使用 `automation:workflow-run:list`、`automation:workflow-run:getDetail`、`automation:workflow-run:decide`、`automation:workflow-run:wake`。
- **文件边界**：共享 channel/schema 使用 `src/shared/ipc/automation/workflow-run.*`；主进程 handler 使用 `src/main/ipc/automation/workflow-run.ts` 并由 automation registry 注册；Preload 暴露 `window.api.automation.workflowRun`；Renderer wrapper 使用 `src/renderer/src/api/automation/workflow-run.ts`。
- **理由**：该方案符合固定六域和 `<domain>:<area>:<action>` 规则，延续现有 workflow IPC 的 automation 归属，并避免新增顶层 `workflow` domain。
- **Proposal 判断**：channel 名称是对尚未实现的设计路径做规范化，本身不改变既有运行行为；Phase 1 新增的 IPC surface、wake/pull 语义和运行态展示仍须在后续 Phase 1 Proposal 中作为公开契约一次性纳入，不能以本次文档同步替代 Proposal。
- **同步到设计**：已同步至 [`phase1-execution-design.md`](./phase1-execution-design.md) §6.2、§11、§12。

### N6 — Run 快照中 `workflowVersion` 的版本语义

**阻塞依据**：设计同时使用 YAML definition 的 `version: 2` 与 Run 快照的 `workflowVersion: 2`，但未说明 Run 是否冻结 definition 内容、字段是否表示不同 schema，以及重启后如何处理 definition 被编辑或快照版本不兼容。若不先冻结语义，状态机可能以新 definition 解释旧的 `currentStage`/`visitCounts`，直接阻塞可靠执行和恢复验收。
**影响范围**：definition 持久化、Run 快照 schema、创建 Run、重启恢复、解析/迁移与错误处理。
**状态**：已结论
**轮次**：2/5

#### 第 1 轮

- **发言人**：Codex（主持人）
- **观点与证据**：要求两位 Agent 只给出 Phase 1 的最小冻结方案：比较“Run 内联 frozen definition”与“不可变 definition 副本/内容 hash”两种表示，明确 `definition.version`、`workflowVersion` 与必要的 `snapshotSchemaVersion` 如何分工，并说明重启遇到不兼容快照时的处理；依据 `phase1-execution-design.md` §8、`definition-schema.md` §1，以及当前按名称读取/覆盖 YAML 的实现。
- **Claude ACP**：推荐 Run 内联完整的 `frozenDefinition: WorkflowDefinition`。创建 Run 时读取、解析并完成 Phase 1 能力预检，随后运行和重启恢复都只使用快照内的冻结 definition，不再重新读取 `definition.yaml`。建议删除语义重复且未定义清楚的 `workflowVersion: 2`，保留 `definition.version: 2` 表示 YAML definition schema；新增 `snapshotSchemaVersion: 1` 表示 Run 快照结构版本。重启时仅接受 `snapshotSchemaVersion === 1`，缺失或不兼容则写回 `status: interrupted` 与 `error.code: INCOMPATIBLE_SNAPSHOT`，不尝试迁移。依据 `definition-schema.md` §2、`phase1-execution-design.md` §3/§8.1/§10.1，以及既有决策日志中 Phase 1 不设计旧 Workflow 迁移的结论。
- **Kimi Code**：推荐在 `runs/<run-id>/definition.yaml` 保存一次性写入的不可变 frozen 副本，Run JSON 只保存相对路径和 `definitionHash`，运行与恢复完全不读取 live `workflows/<workflow-id>/definition.yaml`；明确反对只保存 hash。建议保留并改名 `definitionVersion`，表示创建 Run 时的 definition schema 版本；另新增 `snapshotSchemaVersion: 1` 表示 Run JSON 结构版本。重启时依次校验快照版本、frozen 副本可读性、definitionVersion 和 definition schema；失败则写回 `interrupted` 与结构化 `WORKFLOW_SNAPSHOT_INCOMPATIBLE`，不迁移、不按 live definition 推进，并保留既有产物。
- **主持人判断**：两方都确认必须冻结 definition、运行期不得重新读取 live definition、快照结构需要独立版本字段且 Phase 1 不做迁移；但对冻结内容的存储边界（内联或独立副本）和 `workflowVersion` 的最终命名/去留存在实质分歧。N6 继续讨论，不预设最终字段或迁移策略。

#### 第 2 轮

- **发言人**：Codex（主持人）
- **观点与证据**：要求两位 Agent 针对第 1 轮分歧各选一个唯一方案：A) 完整 `frozenDefinition` 内联到 Run JSON；B) 在 `runs/<run-id>/` 保存不可变 definition 副本，Run JSON 只保存引用/hash。需同时说明创建时如何处理“副本已写入但快照未写入”等崩溃窗口，并在 `workflowVersion` 删除与改名为 `definitionVersion` 中二选一；约束是不能只保存 hash，且必须符合 §8 现有 Run 目录、原子快照写入和 §10.1 恢复规则。不得讨论其他议题。
- **Claude ACP**：第 2 轮仍推荐方案 A：将完整 `frozenDefinition: WorkflowDefinition` 内联到 `<run-id>.json`，删除 `workflowVersion`，新增 `snapshotSchemaVersion: 1`。这样创建 Run 只需一次原子 JSON 写入，没有 definition 副本与快照之间的跨文件一致性窗口；临时文件未 rename 时不会产生可扫描的半截快照，缺失 sessions/output 目录则按合法的刚创建状态处理。恢复时校验快照版本、frozen definition 完整性和 `currentStageId`，失败写回结构化中断错误；依据 `phase1-execution-design.md` §8.1/§10.1 与 `atomic-write.ts` 的原子写入约束。
- **Kimi Code**：接受方案 A：将完整 `frozenDefinition` 内联 Run JSON，删除 `workflowVersion`，新增 `snapshotSchemaVersion: 1`。理由是 §8.1 要求每次推进使用原子写入，内联使完整可恢复状态成为单文件的旧/新二态；独立副本会引入“JSON 已引用但副本缺失”的跨文件窗口。创建顺序固定为组装快照、原子写入、成功后才返回 runId。恢复时校验 JSON、snapshot schema、frozen definition/version/currentStageId；不兼容分别以结构化错误终止为 `interrupted`，不迁移、不读取 live definition，保留已有产物。
- **主持人判断**：两位 Agent 在第 2 轮选择完全一致；N6 达成可执行结论。

#### 最终决定

- **决定**：采用方案 A。Run 快照文件路径保持 `workflows/<workflow-id>/runs/<run-id>/<run-id>.json`，快照内保存完整 `frozenDefinition: WorkflowDefinition`；创建 Run 后的推进、人工决策继续推进和重启恢复一律只使用该冻结内容，不再读取 live `definition.yaml`。
- **快照字段**：删除 `workflowVersion`；新增 `snapshotSchemaVersion: 1`，表示 Run JSON 自身结构版本；definition schema 版本由 `frozenDefinition.version`（Phase 1 固定为 `2`）表达。
- **创建与崩溃处理**：完成 definition 读取、解析和 Phase 1 能力预检后，组装包含 frozen definition 的完整快照，原子写入成功后才向调用方返回 `runId`。写入失败不产生可恢复 Run；不引入外部 definition 副本或仅 hash 引用。
- **恢复校验**：reconcile 依次校验 JSON 可读性、`snapshotSchemaVersion === 1`、frozen definition/schema/currentStageId 完整有效。不可解析或不兼容时保留文件并记录错误；可解析但不兼容的 Run 写回终态 `interrupted`，使用结构化错误码（至少包括 `WORKFLOW_SNAPSHOT_INCOMPATIBLE`、`WORKFLOW_DEFINITION_INCOMPATIBLE`），不尝试迁移、不按 live definition 推进，保留 `visitCounts`、`artifacts`、transcript 和 action outputs。校验通过后，`awaiting_*` 恢复到 active index，`running` 因无 live handle 按既有规则标记 `interrupted`。
- **理由**：两位 Agent 在第 2 轮一致确认单文件原子快照能消除跨文件一致性窗口，并使版本职责单一；方案同时满足 §8.1 原子落盘和 §10.1 的恢复/中断规则。
- **本次处理范围**：该结论涉及 Run 持久化格式和恢复错误契约；本次只将完整方案记录为设计补充，不创建 Proposal、不进入 Apply，也不修改业务代码。
- **同步到设计**：已记录在本文档；字段、路径、流程和验收约束均已写全，后续实现可据此继续办理相应工程流程。

### N7 — Workflow fresh 子 Session 是否可递归触达 `fyllo-workflow`

**阻塞依据**：Phase 1 要求 WorkflowEngine 创建 fresh ACP Session 执行 `Agent(fresh)`，而当前 `createBundledMcpActivation` 按全局 `bundledMcpServers` 生成每个 Session 的 MCP activation（`src/main/infra/mcp/bundled-mcp-servers.ts:64-96`）。Phase 1 新增 `fyllo-workflow` 后，若 fresh workflow 子 Session 默认拿到该 server，它可以再次调用 `trigger_workflow`，形成递归 Run、并发/资源失控和父子归属不清，直接阻塞执行安全边界与验收。
**影响范围**：bundled MCP registry/activation、Workflow fresh runner 的 ACP Session 配置、MCP caller context、递归触发错误契约、资源与 shutdown 归属。
**状态**：已结论
**轮次**：4/5

#### 第 1 轮

- **发言人**：Codex（主持人）
- **观点与证据**：要求两位 Agent 只回答一个边界问题：Phase 1 fresh workflow 子 Session 是否必须显式排除 `fyllo-workflow`，并选择唯一 enforcement point（activation allowlist、MCP handler caller 校验，或两层组合）；同时明确若 Agent 尝试递归触发时的错误码/可观察结果。依据 `phase1-execution-design.md` §4/§5/§10、`src/main/infra/mcp/bundled-mcp-servers.ts:64-96` 的全量 activation、`src/main/services/session/chat/session-runtime-profile.ts:39-43` 的 Session 建立路径，以及 `openspec/specs/fyllo-spawn/spec.md` 的 caller context/owner 约束。不得讨论 N1-N6。
- **Claude ACP**：建议 Phase 1 fresh workflow Session 必须排除 `fyllo-workflow`，并采用双层防护：第一层在 workflow runner 创建 Session 时使用显式 MCP allowlist；第二层在 `fyllo-workflow` RPC handler 校验可信 caller owner，`workflow` owner 返回 `WORKFLOW_RECURSIVE_TRIGGER_FORBIDDEN`，其他非 chat caller 返回 `WORKFLOW_INVALID_CALLER`。正常路径中 Agent 看不到该 server，工具调用表现为 `tool_not_found`；若 allowlist 失效则由 handler 返回结构化拒绝。建议同时排除 `fyllo-spawn` 以避免嵌套 spawn。依据 `bundled-mcp-servers.ts:64-96`、`session-runtime-profile.ts:39-43`、`phase1-execution-design.md` §4/§5/§9.2/§10，以及 MainProcess 的 MCP server allowlist 约束。
- **Kimi Code**：建议必须排除，并采用同样的双层组合：activation allowlist 为主边界，handler caller 校验为纵深防御。建议 Phase 1 workflow profile 显式过滤 `fyllo-workflow`，让 Agent 正常路径看不到工具；handler 根据可信 descriptor/WorkflowEngine 的 workflow session 集合拒绝 workflow caller。建议统一返回 `WORKFLOW_CALLER_UNSUPPORTED`，状态为 `rejected`，不创建 Run 并记录 warn；依据 `bundled-mcp-servers.ts:76-96`、`bundled-mcp-host.ts:190/199-201`、`mcp-workspace-authorization` 的 allowlist 约束、`phase1-execution-design.md` §7/§9.2。
- **主持人判断**：两位 Agent 均确认必须排除 `fyllo-workflow`、采用两层防护、正常路径表现为工具不可见、异常路径不创建 Run；但对是否排除 `fyllo-spawn` 及 handler 错误码粒度存在分歧。N7 继续讨论。

#### 第 2 轮（已发起）

- **发言人**：Codex（主持人）
- **观点与证据**：要求两位 Agent 只收敛两个精确契约：1) Phase 1 fresh workflow Session 的完整 allowlist，必须从 `fyllo-specs`、`fyllo-cortex`、`fyllo-spawn`、`fyllo-workflow` 中给出明确集合；2) handler 发现 workflow-owned caller 时的唯一结构化错误码、message、是否创建 Run，以及普通 Chat caller 与其他 caller 是否需要区分。需兼顾 Phase 1 §2/§5 的 fresh runner 边界、既有 MCP allowlist 机制和 §9.2 的“不创建 Run”预检语义；不得讨论 N1-N6 或 Phase 2 泛化。
- **Claude ACP**：推荐完整 allowlist 为 `["fyllo-specs", "fyllo-cortex"]`，排除 `fyllo-spawn` 与 `fyllo-workflow`。理由是 workflow fresh Session 只负责单个 AgentStage，不应引入嵌套 spawn 或递归 workflow；同时建议 handler 对所有非 chat caller 统一返回 `WORKFLOW_INVALID_CALLER`，携带 `callerOwner` 与 `allowedOwners: ["chat"]`，状态为 `rejected`，不创建 Run。
- **Kimi Code**：同意完整 allowlist 为 `["fyllo-specs", "fyllo-cortex"]`，排除 `fyllo-spawn` 与 `fyllo-workflow`；但建议 handler 统一使用 `WORKFLOW_CALLER_UNSUPPORTED`，结构化拒绝、不创建 Run，并记录 warn。message 携带 caller 类别；普通 chat caller 与其他 caller 不拆分错误码。依据 `bundled-mcp-servers.ts:76-96`、`bundled-mcp-host.ts:190/199-201`、`mcp-workspace-authorization` allowlist 约束和 `phase1-execution-design.md` §7/§9.2。
- **主持人判断**：两位 Agent 对完整 allowlist 和“不创建 Run”一致，但错误码仍分歧：Claude ACP 为 `WORKFLOW_INVALID_CALLER`，Kimi Code 为 `WORKFLOW_CALLER_UNSUPPORTED`。这里的 allowlist 仅指 fresh workflow Session；普通 Chat Session 仍按正常 MCP profile 获得 `fyllo-workflow` 以发起 Run。N7 继续讨论。

#### 记录更正与第 3 轮（已发起）

- **记录更正**：此前草稿曾把 N7 第 2 轮误记为双方已统一采用 `WORKFLOW_INVALID_CALLER`；补读 Kimi Code 对应 turn 的原始回复后确认其推荐的是 `WORKFLOW_CALLER_UNSUPPORTED`。现已更正，N7 仍处于讨论中，未把错误结论同步到主设计。
- **发言人**：Codex（主持人）
- **观点与证据**：第 3 轮只收敛错误码命名，不再讨论已一致的 allowlist。要求两位 Agent 在 `WORKFLOW_INVALID_CALLER` 与 `WORKFLOW_CALLER_UNSUPPORTED` 中选择一个，依据现有 `fyllo-spawn` RPC 错误码命名和 `phase1-execution-design.md` §9.2 的 rejected reason 形状；最终契约必须携带 caller 类别、状态为 `rejected`、不创建 Run，并说明正常 Chat caller 使用既有成功路径。不得讨论 N1-N6。
- **Claude ACP**：选择 `WORKFLOW_CALLER_UNSUPPORTED`。`phase1-execution-design.md` §9.2 已使用 `WORKFLOW_CONTEXT_UNSUPPORTED` 表示 Phase 1 能力边界，`*_UNSUPPORTED` 比 `*_INVALID` 更适合表示 caller 类型超出 Phase 1 支持范围；与 `fyllo-spawn` 的 `SPAWN_UNSUPPORTED_CONFIG` 命名也一致。返回 `status: "rejected"`，message 携带 caller 类型，不创建 Run；普通 chat caller 继续既有成功流程。
- **Kimi Code**：选择 `WORKFLOW_INVALID_CALLER`。`SPAWN_INVALID_REQUEST` 以及 `SPAWN_PARENT_SESSION_REQUIRED/NOT_FOUND` 表明 caller/请求来源问题更接近入口不合法，而 `*_UNSUPPORTED` 用于定义声明了但当前 profile 不支持的能力；本例 definition 没有问题，是 caller 身份不合法。返回 `status: "rejected"`，message 携带 caller 类型，不创建 Run；普通 chat caller 继续既有成功流程。
- **主持人判断**：两位 Agent 在第 3 轮交换了选择，仍未形成一致；双方已确认状态、是否创建 Run 和 message 诊断信息，但错误码的命名分类存在对立证据。N7 进入第 4 轮，要求回应对方的分类依据。

#### 第 4 轮（已发起）

- **发言人**：Codex（主持人）
- **观点与证据**：将第 3 轮双方理由明确化：`WORKFLOW_CALLER_UNSUPPORTED` 强调 Phase 1 只支持 chat caller，`WORKFLOW_INVALID_CALLER` 强调请求来源本身不合法。要求两位 Agent 直接回应对方论据，并在二者中给出唯一最终推荐；判断标准是让调用方正确理解“更换 definition 无法修复、必须由宿主保证 caller owner”，同时保持与现有 `WORKFLOW_CONTEXT_UNSUPPORTED`、`SPAWN_INVALID_REQUEST`、`SPAWN_PARENT_SESSION_*` 的命名边界一致。其他契约不再讨论。
- **Claude ACP**：反驳 `WORKFLOW_CALLER_UNSUPPORTED`：`WORKFLOW_CONTEXT_UNSUPPORTED` 针对可通过修改 definition 修复的能力限制，而 workflow-owned caller 无论 definition 如何修改都不合法；`SPAWN_PARENT_SESSION_*` 更接近 caller 身份/引用校验。因此最终推荐 `WORKFLOW_INVALID_CALLER`。message 携带 caller 类型，状态为 `rejected`，不创建 Run，chat 成功路径不变。
- **Kimi Code**：同意 `WORKFLOW_INVALID_CALLER`。`WORKFLOW_CONTEXT_UNSUPPORTED`/`WORKFLOW_FEATURE_NOT_IMPLEMENTED` 属于 definition 能力预检，换 definition 可修复；caller 校验是请求来源合法性检查，类比 `SPAWN_INVALID_REQUEST` 与 `SPAWN_PARENT_SESSION_*`。错误 message 携带 caller 类型，状态为 `rejected`，入口校验先于能力预检，不创建 Run；chat caller 成功路径和既有 workflow 错误码不变。
- **主持人判断**：两位 Agent 在第 4 轮对错误码命名及语义边界达成一致，N7 在 5 轮上限前收敛。

#### 最终决定

- **决定**：Phase 1 fresh workflow Session 的完整 MCP allowlist 固定为 `["fyllo-specs", "fyllo-cortex"]`；明确排除 `fyllo-spawn` 和 `fyllo-workflow`。Workflow runner 必须使用显式 server 过滤的 activation 创建路径，使 ACP server 列表和 access grant allowlist 同时只包含这两个 server。
- **纵深校验**：`fyllo-workflow` handler 从可信 caller context 校验 owner，只允许 `chat` caller。任何非 chat caller（workflow、spawned、unknown）统一返回 `status: "rejected"`、`reason.code: "WORKFLOW_INVALID_CALLER"`，message 携带 caller 类型/定位信息，主进程记录 warn，不创建 Run；chat caller 继续正常预检、并发检查和创建流程。
- **可观察结果**：正常情况下 workflow fresh Agent 看不到 `fyllo-workflow` 和 `fyllo-spawn`，调用表现为工具不可用；allowlist 失效而请求到达 handler 时返回结构化错误。普通 Chat Session 仍可使用 `fyllo-workflow` 发起 Run。
- **理由**：双层机制满足最小权限和 MCP allowlist/代理校验；排除 spawn 消除嵌套 Session 的 owner、父删除和 shutdown 清理歧义；`INVALID_CALLER` 明确表示 definition 无法修复的请求来源问题，与现有错误码层级一致。
- **本次处理范围**：该结论涉及 fresh Session 的 MCP 能力 allowlist、caller 错误契约和所有权边界；本次只将完整方案记录为设计补充，不创建 Proposal、不进入 Apply，也不修改业务代码。
- **同步到设计**：已记录在本文档；allowlist、enforcement point、错误码和验收行为均已写全，后续实现可据此继续办理相应工程流程。

## B1-B7 交叉复核结论（未重开）

### 复核发言

- **Claude ACP**：独立初审总体判断 B1-B7 的方向基本可行，未发现需要重开既有 B 议题的直接证据；新增的契约/边界阻塞集中在 N1、N6、N7。
- **Kimi Code**：实现核查总体判断当前代码基底具备支撑 B1-B7 的基础能力，未新增 B 议题阻塞；明确将 N1、N6、N7 作为真正阻塞，其余候选项降为实施约束或非阻塞。
- **Codex（主持人）**：两份独立意见没有对 B1-B7 的历史结论提出具体反例，因此不为 B1-B7 重新消耗讨论轮次；沿用历史记录中已经形成的可执行决定，并把本轮新发现写入 N1、N6、N7。

### 最终决定

- **B1**：Phase 1 只实现 `Agent(fresh, freeform)`、`Action(exec)`、`Gate(human)` 和完整 Transition/maxLoops；`inherit`、`expr/verdict`、`Wait`、结构化 artifact/op、`retry`、`idempotencyKey` 在 trigger 预检阶段结构化拒绝且不创建 Run。发言依据为历史决策记录，Claude ACP 与 Kimi Code 均未提出反例；沿用历史结论。
- **B2**：使用 workflow 专属 list/detail/decide/wake 通道；wake 只作失效通知，Renderer 在有 interest 时 pull detail；start、human gate、Action confirmation 使用细粒度 awaiting 状态和同一 decide 入口。沿用历史结论；N1 另行规范化其 domain/channel 命名。
- **B3**：Phase 1 只允许空 `requires` 和 `run.*` 模板引用；其他上下文在 trigger 阶段结构化拒绝，不静默跳过或替换为空字符串。沿用历史结论。
- **B4**：只实现 fresh；复用共享 ACP turn 能力但使用 workflow 独立 runner/store/transcript，不写入 spawned-session store/notification/list；活跃 ACP turn 重启后标记 `interrupted`，父 Session 删除标记 `cancelled`。沿用历史结论；N3/N4 仅补充实现边界。
- **B5**：使用 workspace+parent 复合 active-run key、每 Run 串行推进和原子快照；人工等待态可恢复，活跃执行中断；父删除和 shutdown 分别按既定规则收尾，Run 记录 Phase 1 暂不自动清理。沿用历史结论；N6 进一步冻结快照 definition，具体持久化补充已记录在本文档。
- **B6**：Action 只实现 `exec`，使用已有 `command`/`cwd`，confirm 进入 `awaiting_action_confirmation`，按退出码和日志推进 pass/fail；不新增 workflow timeout，`retry`/`idempotencyKey` 延后并在预检阶段拒绝。沿用历史结论。
- **B7**：新增 HTTP-only `fyllo-workflow`，复用 Host proxy、鉴权、Workspace context 和生命周期；Host 线协议抽象为 server-neutral envelope，server 各自注册 codec/handler，engine 内部创建 fresh Session 不经 MCP。沿用历史结论；N7 进一步收紧 fresh workflow Session 的 server allowlist 和 caller 错误契约。

## 非阻塞/实施约束

- **N2**：WorkflowEngine 接入现有 `SHUTDOWN_PHASES`，实现 quiesce、settle、terminate/force、dispose，并覆盖 emergency shutdown；现有生命周期骨架足以承载，属于实现接线，不单独阻塞方案。
- **N3**：workflow fresh session 使用独立 owner/registry/store；在 AgentStage 启动前生成并持久化可追踪 session ID。`AcpSession` 已支持注入逻辑 session ID、store 和 owner，不需要另造带前缀的公共 ID 规则。
- **N4**：`trigger_workflow` 不信任调用方自报的 `parentSessionId`；沿用 bundled MCP Workspace descriptor 和 caller context 机制，由 workflow RPC bridge 推导可信 caller，并复用 owner 校验。属于实现契约补充，不构成独立方案分歧。
- **N5**：fresh ACP 与 Action `cwd` 均使用父 Session 的冻结 Workspace snapshot；automation 通过 `session/_public` 窄出口获取，不穿透 session service 内部。属于实现约束。
- 编辑器细节、错误文案具体措辞、debounce 时长、能力预检内部算法和 Phase 2/3 的递归编排能力，不阻塞 Phase 1，本轮不展开。

## 最终汇总

- **已结论**：B1-B7 沿用历史结论并经两方初审复核；N1 在 1/5 轮完成命名规范化；N6 在 2/5 轮完成快照冻结/版本结论；N7 在 4/5 轮完成 fresh Session allowlist/caller 结论。
- **待用户决策**：没有问题达到 5/5 仍未收敛，因此当前没有新增的强制用户取舍项。
- **设计同步**：N1 的命名规范化已同步到 `phase1-execution-design.md`；N6 和 N7 的完整方案已作为设计补充写入本文档，未修改业务代码。
- **后续实现注意点**：实现阶段应沿用 N1 的 IPC 文件边界、N6 的冻结快照字段与恢复规则、N7 的 MCP allowlist/caller 规则，以及 N2-N5 的实施约束；这些不属于本次评审需要用户决策的事项。
- **本次评审变更范围**：只修改设计/评审文档；不创建 Proposal，不调用 Apply/Archive，未修改业务代码。
