# Phase2 阻塞问题沟通记录

## 参与方与角色

- **主 Agent（Codex）**：读取仓库事实，拆分 Phase2 blocker，主持有界沟通，审查 Claude ACP 建议并整合结论。
- **Claude ACP**：独立设计评审方，基于仓库文档、OpenSpec、guidelines 和代码提出方案、指出风险和取舍；不修改仓库文件。
- **用户**：最终决策人。若某题第 5 轮仍不能形成确定性结论，主 Agent 将其标记为“待人工审阅”，不再自动追问。

## 日期与讨论要求

- **讨论日期**：2026-09-01。
- **讨论范围**：只处理 Phase2 blocker 文档中的 P0-1～P0-9；Phase1 正在 `workflow-engine-phase1` linked worktree 中实施，其在途任务不作为本轮 blocker。
- **参考基线**：`references/designs/workflow-engine/phase1/phase1-blocker-decision-log.md` 的有界讨论规则，以及 Phase1 已确认的 execution profile、Run owner、wake+pull、持久化和 MCP Host 边界。
- **轮次规则**：每个问题单独计轮次；一次针对该问题的提问及对应回复计 1 次，最多 5 次。形成可执行、可验证结论后立即停止；第 5 次仍未收敛则标记“待人工审阅”。
- **产物规则**：本文件记录轮次、状态和结论；本轮不修改业务代码、不创建 proposal。已确认结论后，另行决定是否同步回 Phase2 设计文档。

## 记录目的与证据基线

本文件是 Phase2 proposal 前的阻塞审查记录，不是新的运行时规范。它需要同时回答三件事：

1. 阻塞问题是由哪一段设计、Phase1 约束或现有实现事实触发的；
2. 每一轮向 Claude ACP 提出了什么问题，Claude 给出了哪些方案，主 Agent 接受或拒绝了什么；
3. 哪些结论已经足够写入后续 proposal，哪些选择仍然必须由用户作出。

### 事实来源

| 来源                                                                                                                                               | 在本次讨论中的用途                                                      | 证据状态                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------ |
| `references/designs/workflow-engine/phase2-agent-generation.md`                                                                                    | Phase2 的生成、确认、UI、复用、MCP 和验收草案；用于定位原始承诺与缺口   | 讨论对象，不自动等于已批准契约 |
| `references/designs/workflow-engine/definition-schema.md`                                                                                          | Workflow YAML 的通用结构和解析期规则                                    | 现有 schema 基线               |
| `references/designs/workflow-engine/phase1/phase1-execution-design.md`                                                                             | Phase1 execution profile、Run owner、wake+pull、持久化、恢复和 MCP 边界 | Phase1 已确认设计              |
| `references/designs/workflow-engine/phase1/phase1-blocker-decision-log.md`                                                                         | Phase1 阻塞题的讨论规则及 B1–B7 的最终取舍                              | Phase1 决策记录                |
| `.worktrees/workflow-engine-phase1/openspec/changes/workflow-engine-phase1/`                                                                       | Phase1 linked worktree 当前实施中的 spec/design                         | 在途实施基线；本轮不修改       |
| `.worktrees/workflow-engine-phase1/src/main/domain/automation/workflow/preflight.ts`                                                               | Phase1 对未实现能力的预检事实                                           | linked worktree 代码事实       |
| `.worktrees/workflow-engine-phase1/src/renderer/src/components/chat/`                                                                              | `ChatBackgroundActivityBar`、EventRail 现有挂载与组合方式               | linked worktree 代码事实       |
| `guidelines/MainProcess.md`、`guidelines/RendererProcess.md`、`guidelines/RendererFeatures.md`、`guidelines/UiDesign.md`                           | 主进程 owner/storage/outbox、Renderer 数据流和 UI 边界                  | 项目 guideline，优先于评审偏好 |
| `src/main/services/session/chat/chat-turn-gate.ts`、`src/main/services/session/spawn/spawn-notification-service.ts`、chat system-reminder provider | 现有 turn gate、notification outbox、system-reminder 顺序和复用先例     | 当前代码事实                   |

### 记录状态的含义

- **事实**：能由上述文档、spec、guideline 或代码直接核对的内容。
- **Claude 建议**：Claude ACP 在某轮提出的候选方案；即使该轮标题写着“已结论”，也要经过主 Agent 复核才能进入最终结果。
- **主 Agent 复核**：对建议进行范围、故障窗口、跨题一致性和行为契约检查后的判断。
- **已结论**：当前题目形成了可执行且可验证的方向，并不表示 proposal 已创建或用户已批准。
- **待人工审阅**：达到第 5 轮仍存在会改变行为、安全、所有权或事务保证的选择；不再自动替用户决定。

## ACP 回复索引

以下 `responseId` 是对应 ACP 回复的可追溯索引；它们只用于审计讨论过程，不替代本文件中的主 Agent 复核。

本次 9 个题目均使用独立 ACP session，以 `background=true` 发起；主 Agent 在发起后继续处理其它题目，由 ACP 完成通知驱动后续轮次。通知的到达顺序不作为题目顺序或结论依据，轮次以每个题目的提问/回复配对计数。

| 问题 | Session                                | 各轮 responseId（按轮次）                                                                                                                                                                                             |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 | `dea1bd20-0103-460e-b7cc-e9836c2a8592` | 1: `4cd0995e-58dc-4242-bbe3-c5fdf2c9317f`；2: `5818594c-bbce-48fe-9f5d-10daf9f26604`                                                                                                                                  |
| P0-2 | `966bfe24-516f-4c2b-926d-4feeb06751ad` | 1: `ceaccea2-a9f0-4cab-b778-adb6d039263d`；2: `cff5398d-f256-4da8-86ff-005e127e6ec0`；3: `2b2e544c-43c4-4928-a53d-7b237137d919`；4: `0f5935e0-ba5f-493a-b470-9cf70faf54f7`；5: `0695cfae-f3b3-4258-abc5-654ea57adda1` |
| P0-3 | `2e3d0c89-b6d6-438c-8e4f-4b49cc3d8589` | 1: `fdf332be-465e-4651-aabb-b29625025000`；2: `bb3b28ea-8178-4980-89c1-93a2c58ed07e`                                                                                                                                  |
| P0-4 | `a2423786-faa4-47c0-a2c7-6315b50d64e7` | 1: `83d3c6ac-b75d-4f79-a1b7-99f2f335b7f6`                                                                                                                                                                             |
| P0-5 | `3837a3de-fb2d-4be4-981c-a655607eb79a` | 1: `69fef2e8-3710-45b3-aee3-25737430b368`；2: `6f69ef6e-e12a-4768-a0f6-b63ea896f07f`                                                                                                                                  |
| P0-6 | `b28bfd54-088d-4eaa-b0d3-a539b695341f` | 1: `fc457a84-fcbf-4980-8b9b-f43685dc84e2`；2: `e9ea6aec-51f3-4c71-8889-c1dacb77e9a6`                                                                                                                                  |
| P0-7 | `0eaca52b-fc24-4010-af4a-937567a2c31c` | 1: `0ad56acb-c91a-4f5a-8cab-6393f39dba53`；2: `d782cf5c-d93f-4e5b-8f15-1a8c48dd9d8c`；3: `1d9fcc6a-6a0d-4cd4-92b4-ec08a8a9e7f3`；4: `46453f8c-af48-42dd-8518-9c381d4bfcd1`；5: `e4d0b1ec-019e-4401-8990-025533412d18` |
| P0-8 | `823a84ef-c259-431b-9e40-2bd7f7910fba` | 1: `0e1783c0-c5a9-4bb1-b5b4-32d701cd4d6b`；2: `8b6edeec-d9ef-4be0-9218-e6f34ff98e38`；3: `f678324d-519f-4259-aa54-e75a722abf84`；4: `0576dad9-22e1-4062-83df-dbce1218538c`；5: `be0e84ad-1c8f-44a0-acad-a2432a37cca8` |
| P0-9 | `76a666ae-1f8c-480c-8280-2f0f026ee840` | 1: `1b3d7e84-37f6-4f66-b55e-58dba077e05c`                                                                                                                                                                             |

## 问题状态

| 编号 | 阻塞问题                                          |                轮次 | Claude ACP Session                     | 状态                                       |
| ---- | ------------------------------------------------- | ------------------: | -------------------------------------- | ------------------------------------------ |
| P0-1 | 提案 owner、身份和发现协议                        |                 2/5 | `dea1bd20-0103-460e-b7cc-e9836c2a8592` | 已结论                                     |
| P0-2 | 确认到落盘/创建 Run 的事务与幂等                  |      5/5 + 用户决策 | `966bfe24-516f-4c2b-926d-4feeb06751ad` | 已结论（用户确认）                         |
| P0-3 | 完整 schema 与 Phase1 execution profile 冲突      |      2/5 + 用户决策 | `2e3d0c89-b6d6-438c-8e4f-4b49cc3d8589` | 已结论（用户确认）                         |
| P0-4 | session-only workflow 的 definition/run 来源      |                 1/5 | `a2423786-faa4-47c0-a2c7-6315b50d64e7` | 已结论                                     |
| P0-5 | `context: inherit` 与 ChatTurnGate 语义           | 2/5 + P0-3 用户决策 | `3837a3de-fb2d-4be4-981c-a655607eb79a` | 已结论（用户确认的运行时边界）             |
| P0-6 | 确认结果 reminder/outbox 契约                     |      2/5 + 用户决策 | `b28bfd54-088d-4eaa-b0d3-a539b695341f` | 已结论（用户确认）                         |
| P0-7 | agent 生成内容的执行安全边界                      |      5/5 + 用户决策 | `0eaca52b-fc24-4010-af4a-937567a2c31c` | 已结论（用户确认）                         |
| P0-8 | system-reminder 与主动提议行为契约                |                 5/5 | `823a84ef-c259-431b-9e40-2bd7f7910fba` | 已结论（首版最小默认，见设计同步备注）     |
| P0-9 | EventRail 与 Phase1 WorkflowRunActivityEntry 冲突 |                 1/5 | `76a666ae-1f8c-480c-8280-2f0f026ee840` | 已结论（首版最小兼容默认，见设计同步备注） |

## 讨论记录

> 以下各题的回复到达后按轮次追加。每轮均保留“事实与判断、推荐方案、未决选择”，避免把 Claude ACP 的推测直接写成项目契约。

### P0-1 — 提案 owner、身份和发现协议

#### 第 1 轮

**状态**：继续讨论。

**事实与判断**：Claude ACP 确认缺口包括 proposal 元数据缺少 `workspaceId`/`parentSessionId`/状态/时间、没有 proposal 专属 IPC、wake/list/detail interest、跨窗口隔离、重启 reconcile 和 parent/workspace 删除规则。现有 Phase1 Run owner 三元组和 spawned-session owner-scoped 读取可作为边界参照。

**推荐方向**：保留 `.tmp/workflows/<proposal-id>.yaml`，增加 owner-scoped metadata；新增独立 proposal list/detail/confirm/cancel/wake；wake 携带 workspace、parent 和 proposal 标识；只允许同一 owner 的窗口读取/操作；重启扫描未决提案，parent 不存在则清理且不发送 reminder。

**主持问题**：proposal 的完整 owner 是否是 `workspaceId + parentSessionId + proposalId`？proposal wake 应否与 Run wake 分离？哪些窗口可以 list/getDetail/confirm/cancel？重启发现和 parent/workspace 删除是否属于本题？本轮要求暂不展开 P0-2 的跨文件事务实现。

**Claude 回复焦点**：Claude 先提出 workspace `.tmp/workflows/` 下的 JSON/state 文件、proposal 专属 IPC、owner 校验、wake+pull、重启扫描和可选超时清理；同时列出 proposalId 生成、幂等操作、decision outbox 等 11 个缺口。

**主 Agent 复核**：workspace `.tmp` 路径和超时清理只是候选实现，不能覆盖 session owner 语义；decision outbox 与 confirm 事务分别归入 P0-6/P0-2。下一轮只收敛身份、存储归属、发现和可见性。

**下一轮问题**：在不预设事务方案的前提下，给出最小 owner/discovery 契约及其可验证的路径、IPC、wake、list 和生命周期规则。

#### 第 2 轮

**状态**：已结论。

**结论**：Proposal 是 session-owned transient state，路径收敛为 `workspaceDataDir(workspaceId)/sessions/<parentSessionId>/workflow-proposals/<proposalId>/{definition.yaml,.meta.json}`；metadata 至少记录随机不可预测的 `proposalId`、`workspaceId`、`parentSessionId`、`mode/workflowId`、agent 建议的 persist、状态和时间。新增独立 `automation:workflow-proposal:list/getDetail/confirm/cancel/wake`，所有入口都校验 workspace、parent 和 proposal owner；wake 携带三者，session 页面首次加载通过 list level-triggered 发现 pending proposal。跨 session/workspace 不可见；同一 session 的多窗口可共同操作；parent 删除级联清理 proposal，workspace 删除由目录级联处理。

**主持收口与验收点**：本轮逐项确认了五个选择：proposalId 只需不可预测随机值，不编码 owner；proposal 目录放在 session-owned 路径，不放 workspace 根 `.tmp`；proposal wake 独立于 Run wake；session 页面用 level-triggered `list` 处理重启后的发现；同 owner 多窗口共享，跨 owner 必须拒绝。以下行为可以单独验收：

- 伪造或错配 `workspaceId/parentSessionId/proposalId` 的 list、detail、confirm、cancel 请求均不能读取或修改提案；
- 同一 session 的两个窗口收到同一 wake 后都能拉取同一 proposal；不同 session 只能得到 owner-scoped 拒绝；
- parent session 删除时 proposal 目录随 session 级联删除，workspace 删除不需要额外的 proposal 专用清理扫描；
- 应用重启后即使没有新的 wake，session 页面首次 `list` 仍能发现 pending proposal。

**未在本题决定的内容**：confirm/cancel 的跨文件事务、decision reminder 的 outbox 和 Run 创建顺序转入 P0-2/P0-6；不把 Claude 第 1 轮提出的可选 7 天 TTL 写成契约。

### P0-2 — 确认到落盘/创建 Run 的事务与幂等

#### 第 1 轮

**状态**：继续讨论。

**事实与判断**：确认流程跨越正式 definition/session 文件、Run snapshot 和临时提案，不能靠单文件原子写入获得跨文件一致性；重复点击、多窗口确认、崩溃和 update 覆盖均会产生半完成状态。

**推荐方向**：增加 proposal metadata/state 文件，使用显式状态机和重启 reconcile；对确认/取消提供幂等结果；update 需要明确并发胜者或冲突策略。

**主持问题**：确认操作横跨 definition、Run snapshot 和 proposal 清理，最小可恢复状态机应记录哪些阶段？重复 confirm/cancel、两个窗口并发、进程崩溃和 `mode: update` 覆盖分别如何收敛？本轮还要求区分“结构校验失败”和“持久化失败”。

**Claude 回复焦点**：Claude 提出在提案文件旁增加 state 文件，使用 `pending → confirming → confirmed/cancelled`，通过原子状态更新防止重复确认；建议在启动时根据 definition/Run 是否存在做 reconcile，并把 `mode: update` 的 base hash/revision 检查列为可选方案。

**主 Agent 复核**：状态机方向可保留，但“单文件 CAS”不能自动提供 definition、Run、临时文件三者的事务一致性；base revision 也与 Phase2 第 10.3 节的 last-write-wins 取向存在冲突，需后续明确。Claude 给出的失败时直接删除目标文件会误伤既有 update 资产，暂不接受。

#### 第 2 轮

**状态**：Claude 声称已结论；主 Agent 复核中。

**结论摘要**：采用 `.meta.json` 记录 owner、`pending/confirming/confirmed/cancelled` 状态和确认结果；同一 proposal 的确认/取消使用状态迁移与幂等返回；失败由状态回滚和重启 reconcile 补偿；Phase 2 第 10.3 节解释为不增加二次冲突 UI，而不是允许无定义的并发覆盖；update 采用明确的 last-write-wins，不引入 base revision。

**主 Agent 复核备注**：Claude 给出的“原子替换即 CAS”及“失败时直接删除 definition”仍需在 proposal 前修正为真正的单进程串行 claim、不会误删既有 update 目标的补偿方案；若第 3 轮无法封口，将转人工审阅。

**本轮未采纳项**：不把文件原子替换称为跨文件 CAS；不在没有目标存在性/旧内容保护的情况下用 `unlink(definitionPath)` 作为通用回滚；不因为“没有冲突 UI”就省略并发胜者和重启恢复语义。

**下一轮问题**：请把公共 confirm 请求、Main 内部 claim、definition 写入、Run 创建和终态返回拆开，覆盖 `update + workspace`、`update + session`、重复确认及失败补偿。

#### 第 3 轮

**状态**：Claude 声称已结论；主 Agent 复核中。

**结论摘要**：Claude 改为 Main 进程按 `proposalId` 串行 claim，公共 confirm 请求只携带 owner、`proposalId` 和用户最终 `persist`；`runId` 在 claim 阶段由 Main 生成并持久化。状态采用 `pending → confirming → confirmed/cancelled`，confirming 内部记录 `claimed/definition_written/run_created/finalized` 等阶段；update+workspace 建议 staged 文件和旧版本备份，Run snapshot 按 `runId` 幂等写入。

**主 Agent 复核备注**：第 3 轮仍把 update 目标在 Run 失败时直接删除，且 update+session 也可能丢失原有 session definition；不能视为封口。

**本轮讨论的可执行部分**：confirm 请求只携带 owner、`proposalId` 和用户最终选择的 `persist`；内部 `runId` 由 Main 生成并持久化；重复请求应返回已有状态/Run，而不是再次创建副作用；last-write-wins 仍指“后完成的目标写入覆盖前一版本”，不等于可以无条件删除前一版本。

**未决故障窗口**：若 Run 创建失败，原有 workspace/session definition 是否应恢复；若 proposal 状态已经写成 `confirming` 后进程崩溃，如何判断 definition rename 是否发生；Run 文件存在但内容不完整时是否可视为成功。本轮因此继续进入故障窗口审查。

#### 第 4 轮

**状态**：Claude 声称已结论；主 Agent 仍发现崩溃窗口。

**结论摘要**：Claude 增加 `backup_created/definition_staged/definition_committed/run_created` 阶段、update+workspace 的 backup/staged/rename 流程和幂等 Run 写入，明确不让 Renderer 提供内部 token，并保留 last-write-wins。

**主 Agent 复核备注**：`definition_staged` 之后可能已经 rename 覆盖正式文件、但 phase 尚未写成 `definition_committed`；重启时若按该 phase 删除 staged/backup，会留下新版本并丢失旧版本。因此进入第 5 轮。

**故障矩阵复核**：`claimed`、`backup_created`、`definition_staged`、`definition_committed`、`run_created` 这些阶段名称只能描述意图，不能单独证明文件系统副作用。特别是 staged 文件 rename 与 phase 元数据更新之间存在崩溃窗口；重启 reconcile 必须读取目标内容并结合持久化 intent 判断，而不能只按 phase 删除文件。

**下一轮问题**：是否能用持久化 commit intent、目标/备份 hash 和 Run provenance 封口 rename 判断、恢复顺序、Run 幂等及不同 proposal 更新同一 target 的并发顺序？

#### 第 5 轮

**Claude ACP 状态**：已结论。建议使用持久化 `commit-intent`、目标内容 hash 与旧版本 hash，在 rename 前记录意图，重启按 hash 判断 rename 是否已发生；公共 IPC 仍只有 owner、`proposalId`、`persist`，并覆盖备份、staged、Run 写入和并发矩阵。

**主 Agent 最终复核**：待人工审阅。第 5 轮的伪代码仍存在可验证缺陷，无法把它当作 proposal 的无歧义事务契约：

1. definition 阶段异常处理先删除 backup，再尝试用 backup 恢复；rename 后 meta 更新失败时会因此失去恢复源。
2. update+session 的既有目标没有同等 backup/restore 保护，Run 创建失败仍可能删除原 session definition。
3. 仅用“Run 文件存在”判定成功，未定义 snapshot 内容/来源校验；部分写入或不一致 Run 的重启结果仍不明确。
4. 不同 proposal 更新同一 workspace workflow 时，需要按解析后的 target 追加锁；仅按 proposalId 锁不足以证明 last-write-wins 的提交顺序。

**已确定但不能代替人工审阅的方向**：应采用 target 级 Main 串行化、所有 update 目标统一 staged+可验证 backup、rename 前持久化 commit intent/hash、Run snapshot 以 `runId + provenance` 幂等校验；在上述恢复协议被重新审阅前，不创建 proposal。

**第 5 轮的具体验收缺口**：

- rename 成功而 meta 更新失败时，恢复源仍必须可用，不能先删除 backup 再尝试恢复；
- `update + session` 与 `update + workspace` 都必须具有同等的 staged、backup、restore 和目标存在性语义；
- Run “存在”必须同时满足 `runId`、workflowId、owner、definition provenance 和完整 snapshot 可验证，而不是只看文件路径；
- 同一 workspace workflow 被不同 proposal 更新时，必须在解析后的 target 上串行化，不能仅按 proposalId 加锁；
- reconcile 需要明确“未 rename”“已 rename 未建 Run”“Run 已写入但 meta 未 finalized”各自的最终状态，且不误删旧 definition。

这些缺口不是文字偏好，而是会改变数据安全与幂等保证的技术协议，因此本题按规则在第 5 轮标记为待人工审阅。

#### 用户决策（2026-09-01）

**状态**：已结论（用户确认）；P0-2 不再因完整跨文件事务协议阻塞 Phase2 proposal。

**用户判断**：ACP 第 1–5 轮把许多尚未发生的崩溃、部分写入、并发覆盖和恢复窗口都提升成了前置事务要求，属于过度防御。Phase2 首版只需要基本校验和清晰的职责边界，不需要在 proposal 阶段承诺完整的跨文件事务、target 锁或复杂 backup/restore 协议。

**确认 IPC 的职责**：

1. 校验 proposal owner、proposal 当前状态、YAML/schema、Phase1 execution profile 以及用户选择的 `persist`；
2. 将 workflow definition 落盘到 P0-1/P0-4 规定的正式来源（workspace 或当前 session）；
3. 不在确认 IPC 中创建 Run，不由确认 IPC 直接调用 `trigger_workflow`，也不等待 workflow 执行完成；
4. 落盘成功后触发一条发给主 Agent 的 `role: user` `<system-reminder>`，说明 workflow 已经保存，并提示主 Agent 调用 `trigger_workflow` 开始执行；
5. 落盘失败返回基本的结构化错误，不为了覆盖假想故障而引入跨文件补偿状态机。

**`trigger_workflow` 的职责**：

- `trigger_workflow` 是执行入口，由 Main process 根据当前 owner、workflow definition 和已有 Run 记录决定“创建新 Run、启动尚未开始的 Run，或从现有 Run 进度继续”；
- 没有 Run：创建 Run，并从第一个 stage 开始；
- 已落盘 workflow 但应用在 Run 创建前崩溃：重启后用户让 Agent 再次调用 `trigger_workflow`，正常创建并开始 Run；
- 已生成 Run 但尚未真正执行时崩溃：再次调用 `trigger_workflow` 时继续该 Run，而不是要求确认 IPC 负责补偿；
- Run 执行到一半时崩溃：再次调用 `trigger_workflow` 时读取 Run 的 stage 进度，按已有进度继续推进，不重放已经完成的 stage；
- 具体 Run 状态和 stage 进度仍沿用 Phase1 的执行模型，Phase2 不在确认 IPC 中复制一套恢复逻辑。

**职责流转**：

```text
用户确认
  → confirm IPC：基本校验 + workflow 落盘
  → role=user system-reminder：告知主 Agent 已保存
  → 主 Agent 调用 trigger_workflow
  → Main：新建 / 启动 / 按 Run stage 进度恢复
```

**与前五轮 ACP 结论的关系**：commit-intent、target 级锁、统一 staged/backup、跨文件 reconcile 和“Run snapshot 内容 hash 才算成功”等方案保留为历史审查意见，不再是本题的 proposal 前置条件。它们只有在未来真实出现数据一致性问题、需要更强恢复保证或用户明确要求时，才另起技术增强议题。

**本题验收边界**：

- confirm IPC 成功后能读取正式 workflow definition，且不会隐式创建 Run 或阻塞等待执行；
- `role: user` system-reminder 能让主 Agent 获知“workflow 已落盘”，并由 Agent 显式发起 `trigger_workflow`；
- `trigger_workflow` 对无 Run、未开始 Run、进行中 Run 分别走创建、启动或按 stage 进度继续路径；
- 同一 workflow 的重复触发、完成后是否允许再次运行等不在本次 P0-2 用户决策中新增规则，遵循 Phase1/后续 trigger 设计的既有语义；
- 不把假想崩溃窗口扩写成 confirm IPC 的跨文件事务承诺。

**主 Agent 复核**：用户已明确选择“基本校验 + 落盘/执行解耦”的方向，P0-2 的核心阻塞解除。需要在后续 proposal 中准确描述 confirm IPC 与 `trigger_workflow` 的边界，并把 Run 恢复责任放在 Main 的 trigger 路径；不能继续以 ACP 第 5 轮的完整事务伪代码作为硬性设计前提。

**后续决策覆盖（P0-3，2026-09-01）**：上列确认 IPC 职责中的“Phase1 execution profile”不再作为 confirm 的完整前置能力门槛。confirm 仍做 owner、状态、schema 和 `persist` 等基本校验；运行时能力判断统一由 `trigger_workflow` 负责。本段保留 P0-2 的历史记录，最终边界以 P0-3 用户决策段为准。

### P0-3 — 完整 schema 与 Phase1 execution profile 冲突

#### 第 1 轮

**状态**：继续讨论。

**判断**：Phase2 的“完整 schema 可生成”与 Phase1 只执行 fresh/freeform Agent、exec Action、human Gate 的既定 profile 冲突，确认后才 preflight 会造成正式资产落盘后才失败。

**推荐方向**：在 `propose_workflow` 阶段追加 Phase1 execution-profile 预检，非法结构与合法但不支持分别返回结构化错误。

**主持问题**：Phase2 设计是否继续接受完整 definition schema，还是在 Phase1 linked worktree 实际能力边界内收窄？不可执行定义最晚应在哪个阶段被拒绝？`describe_workflow_schema`、确认 IPC 和验收如何与该边界一致？

**Claude 回复焦点**：Claude 对比了三条路径：扩展 Phase1 支持完整 schema、允许保存但标记更高引擎版本、或在 `propose_workflow` 前置 execution-profile preflight。它判断前两者会分别扩大 Phase1 范围或引入新的版本契约。

**主 Agent 复核**：Phase1 正在 linked worktree 实施且 B1 已收窄为 `fresh + exec + human`，本轮不能通过改 Phase1 来解 blocker；“保存一份当前不能执行的 workflow”也会破坏 Phase2 的确认并执行闭环。因此只继续验证前置预检方案。

#### 第 2 轮

**状态**：历史建议，已被用户决策收窄。

**结论**：Phase2 首版采用 Phase1 子集；校验顺序为 schema 结构 → execution profile → mode/workflowId。`describe_workflow_schema` 和常驻提示必须明确当前子集；`withExamples` 只提供可执行子集示例；confirm IPC 再做防御性同等校验，失败不落盘、不创建 Run；验收覆盖合法但不支持的 YAML。`inherit`、WaitStage、非 exec Action、非 human Gate、retry/idempotencyKey 均在 propose 阶段拒绝。

**具体拒绝集合**：`context: inherit`、`WaitStage`、非 `exec` 的 ActionOp、非 `human` 的 Gate、非 `freeform` 的 produces、`retry`、`idempotencyKey` 以及不在 Phase1 允许范围内的模板/工具能力，均属于“schema 合法但 execution profile 不支持”；错误需带 YAML 路径和结构化 rule，且在写入 proposal 临时区、触发 wake 之前返回。

**防御性二次校验**：confirm IPC 仍重新执行同一 profile 校验，用来覆盖应用重启、版本降级、临时文件被修改或 propose 校验逻辑漂移；该校验失败时不写正式 definition、不创建 Run。它不是第二个产品选择，而是对 propose 前置校验的安全兜底。

**同步清单**：后续 proposal 必须同时更新 `describe_workflow_schema` 的当前能力段、`withExamples` 示例、chat 常驻 capability 提示、`propose_workflow` 的错误结构和 Phase2 验收场景；Phase3 扩展能力时再同步放宽这些位置，不新增 `minEngineVersion` 或迁移格式。

#### 用户决策（2026-09-01）

**状态**：已结论（用户确认）。

**用户判断**：要求 `propose_workflow` 在提案阶段完成完整 execution-profile 预检，会把运行时能力判断前置成额外契约，属于过度设计。Phase2 首版只需要基本校验；真正执行前再由 `trigger_workflow` 判断当前实现是否支持该 definition。

**决策落点**：

- `propose_workflow` 只做 owner/context、提案状态、YAML 可解析性、definition schema、`mode`/`workflowId`/`persist` 形状与组合关系等基本校验；校验失败时不生成提案、不触发 wake。
- schema 合法但超出 Phase1 execution profile 的 definition（例如 `context: inherit`、WaitStage、未实现的 Action/Gate、`retry` 或 `idempotencyKey`）可以进入 proposal，不能因为“当前不能执行”在 propose 阶段被拒绝。
- `trigger_workflow` 是唯一权威的运行时能力校验入口：在创建新 Run、启动尚未执行的 Run 或恢复已有 Run 前，执行 Phase1 profile preflight；不支持时返回带 stage/feature 定位的结构化错误，不创建或推进执行。
- confirm IPC 继续遵循 P0-2 的落盘与职责边界，只做该流程所需的基本 owner/state/schema/persist 校验，不复制一套独立的运行时能力策略；任何运行时能力判断最终以 `trigger_workflow` 为准。
- 不新增 `minEngineVersion`、迁移格式、提案阶段的 capability 矩阵或其它版本协调机制。

**与 Phase1 规格的对齐**：Phase1 已确认“定义态合法但超出 execution profile 的 workflow MAY 被保存”，并要求 `trigger_workflow` 在创建 Run 前结构化拒绝。本决定将 Phase2 的 propose 行为恢复到这一边界，不扩大 Phase1 linked worktree 的实现范围。

**验收边界**：

1. malformed YAML、缺必填字段、重复 stage id、坏引用或非法 mode/workflowId 组合在 `propose_workflow` 阶段被拒绝。
2. schema 合法但当前不支持执行的 definition 可以生成并展示 proposal，且不触发 capability preflight 拒绝。
3. `trigger_workflow` 在任何 Run 创建、启动或恢复动作前完成能力校验；unsupported definition 返回结构化错误，不启动 ACP、Action 或新的 Run。
4. supported definition 仍按 Phase1 execution profile 进入既有 Run 流程；Phase2 不为 unsupported 能力新增执行器、turn kind 或恢复协议。

**主 Agent 复核**：P0-3 的“propose 前拒绝 unsupported”结论由本段用户决策覆盖。后续 proposal 需要分别描述 propose 的基本校验和 trigger 的运行时 preflight，不能再使用“propose/confirm 双重完整 profile 校验”作为阻塞条件。

### P0-4 — session-only workflow 的 definition/run 来源

#### 第 1 轮

**状态**：已结论。

**事实与判断**：Phase2 的 session 目录与 Phase1 workspace-only `loadDefinition` 不兼容；`mode: update + persist: session` 允许同一 workflowId 在两种来源共存。

**主持问题**：`trigger_workflow(workflowId)` 在同一 workflowId 同时存在 workspace 和 session definition 时从哪里读取？session workflow 是否进入 `list_workflows`？Run 如何冻结来源？session 删除后历史 Run 是否还能查看？

**Claude 回复焦点**：Claude 将来源问题拆成 source discriminator、ID 共存、Run snapshot provenance、查询可见性、`update + session` shadow 语义和 session 生命周期六部分；建议 MCP/Main 自动注入当前 session context，按 session → workspace 解析，不把 source 参数暴露给 agent。

**结论**：由 MCP/Main owner context 自动注入当前 session；以 `(workspaceId, sessionId?, workflowId)` 唯一定位，session 版本优先于 workspace 版本；允许 ID 跨来源共存；`list_workflows` 仍只列 workspace，`trigger_workflow` 按 session→workspace 解析；Run snapshot 增加 definition source/provenance；session workflow 随 session 生命周期处理，历史 Run 保留并能标记定义缺失；`update + session` 明确为 session shadow，不自动升格。

**验收边界**：

- `mode: create + persist: session` 和 `mode: update + persist: session` 都写入当前 session 的 definition 目录，不覆盖 workspace 正式资产；
- 同一 `workflowId` 在 workspace 与 session 同时存在时，当前 session 的 `trigger_workflow` 命中 session 版本，其它 session 命中各自 session 版本或 workspace 版本；
- `list_workflows` 不把 session shadow 暴露为可复用 workspace 候选；如 Renderer 需要当前 session 的合并视图，另设 session-scoped 查询，不改变 MCP list 语义；
- Run snapshot 记录实际命中的 source/provenance。session definition 删除后，历史 Run 仍保留，并显示“定义缺失/已变更”，不得静默改用另一份 definition 解释旧状态；
- session workflow 不提供确认后的自动升格或跨 session 复制入口。

### P0-5 — `context: inherit` 与 ChatTurnGate 语义

#### 第 1 轮

**状态**：继续讨论。

**事实与判断**：Phase1 已明确 fresh-only，当前 ChatTurnGate 只有 `user | notification`；Phase2 没有定义 inherit 的 ACP 复用、消息可见性、队列/优先级、queued 状态、重启和取消语义。

**推荐方向**：即使 proposal 可以保存 schema 合法但当前不支持的 definition，Phase2 首版也不应实现 inherit 的运行时语义；由 `trigger_workflow` 的能力预检返回结构化 unsupported，不引入 workflow turn；完整 inherit 运行时应延后到单独阶段并另行定义。

**主持问题**：如果不收窄 schema，inherit stage 需要怎样复用 ACP session、进入 parent transcript、与 user/notification turn 排队、持久化 queued 状态并在重启/删除时清理？如果采纳 P0-3 的 Phase1 子集，这些语义是否可以明确排除在 Phase2？

**Claude 回复焦点**：Claude 列出 inherit 的六个未闭合点：ACP handle 复用、transcript 可见性、ChatTurnGate 互斥/优先级、queued 状态、取消与重启恢复、循环重复执行；同时给出“完整实现 inherit”与“Phase2 拒绝 inherit”两条路径。

**主 Agent 复核**：inherit 不是只增加一个 enum 值，而会改变 ChatTurnGate、消息归属、Run 状态和生命周期契约。由于 Phase1 B4 已明确 fresh-only，本轮只要求把“运行时不支持”写入 trigger preflight、schema 提示和验收，不在 Phase2 预先发明 workflow turn。

#### 第 2 轮

**状态**：已结论。

**结论（历史建议，已被 P0-3 用户决策收窄）**：Phase2 首版不执行 `context: inherit` 及所有 Phase1 未实现能力；合法 definition 可以先生成 proposal，真正调用 `trigger_workflow` 时由 runtime preflight 返回结构化 unsupported。第 6.3 节 inherit 运行时语义仍改为“不支持”，第 7.4 节不新增 workflow turn 或通用 ChatTurnGate，只复用现有 spawn notification 的 `notification` kind；未来实现 inherit 时另行定义 ACP、消息、队列和恢复契约。

**设计改写边界**：第 5.1 节必须承认 execution profile 由 trigger runtime preflight 限制；第 6.3 节不再描述 Phase2 的 inherit 运行时；第 7.4 节改为复用 spawn notification 的投递模式；第 12 节增加“合法 YAML 含 inherit 可以生成 proposal，但 trigger 前返回 unsupported 且不创建 Run”的场景。`ChatTurnGate` 只复用已有 `notification` kind，不新增 `workflow` kind，不新增通用 turn queue。

**解除范围**：本题只说明 Phase2 不会执行 inherit，也不为它增加 workflow turn；proposal 阶段是否保存 schema 合法的 inherit definition 已由 P0-3 收窄为允许保存。未来若实现 inherit，必须另起设计讨论，重新定义 ACP、消息、队列、取消、重启和幂等契约，不能把本题结论当作未来实现方案。

### P0-6 — 确认结果 reminder/outbox 契约

#### 第 1 轮

**状态**：继续讨论。

**事实与判断**：现有 spawn notification 已有 owner-scoped durable outbox 和 `pending/dispatched/delivered/delivery_unknown/suppressed` 语义；workflow decision 的 owner 是 `workspaceId + parentSessionId + proposalId`，草案未定义 record、确认是否反馈、顺序和重启/删除处理。

**推荐方向**：独立 workflow decision record 类型，复用五状态和 ChatTurnGate；确认/取消按决定顺序串行投递，避免重复；需要继续确认 confirm 是否也产生 reminder、存储层级和 orchestrator 边界。

**主持问题**：Phase2 只明文要求取消结果回传给 agent，confirm 是否也需要 reminder？decision record 是 proposal 文件的一部分、spawn turn 的嵌入字段，还是独立 session-owned 文件？Renderer 是否能直接 claim？多个决定、turn 忙碌、重启和 parent 删除如何处理？

**Claude 回复焦点**：Claude 先建议对称地为 confirm/cancel 都写 outbox，并按 `decidedAt` FIFO 投递；建议复用 spawn 的五状态、ChatTurnGate 和 at-most-once 语义，同时把 workflow decision 建成独立 record。初轮还提出了 24 小时清理和 workspace `.tmp` outbox 等候选做法。

**主 Agent 复核**：confirm reminder 不是 Phase2 草案的必需行为，Run wake 和 confirm IPC 返回已提供正向信号；workspace 根 `.tmp` 会破坏 P0-1 的 session owner。24 小时 TTL 没有 correctness 依据，不能写入契约。下一轮只保留与 Phase1 notification 先例能对齐的最小取消反馈。

#### 第 2 轮

**状态**：已结论。

**结论**：首版只为取消决定产生 invisible reminder，确认通过 confirm IPC 的成功返回和后续 Run wake 感知，不新增 confirm reminder。decision record 独立于 spawn notification，按 `workspaceId + parentSessionId + proposalId` 绑定 owner，存放在 workspace-owned session 子目录；复用五状态 `pending/dispatched/delivered/delivery_unknown/suppressed`，由 Main 的 service/orchestrator 负责 claim 和投递，Renderer 不直接认领。决定按 `decidedAt` FIFO；ChatTurnGate 忙时保持 pending，释放或唤醒时重试；重启将 dispatched 视为 delivery_unknown，parent 删除转 suppressed；delivered 保留至 session 删除，不引入任意 TTL。可复用现有 ChatTurnGate，但不把 workflow decision 与 spawn notification 强行合并为一个新公共协议。

**可验证的状态路径**：

```text
cancel → decision record(pending) → Main claim/dispatched
      → notification turn → delivered
      ↘ turn 忙碌：保持 pending，释放后重试
      ↘ 重启：dispatched → delivery_unknown，不重发
      ↘ parent 删除：pending → suppressed
```

**明确排除项**：confirm 不新增 reminder；Renderer 不持有 claim 权限；decision record 不嵌入 spawn turn，也不与 spawn notification 合并成一个新的公共协议；不使用 workspace 根级 `workflow-decision-outbox`；不设置任意 TTL。decision record 的具体字段至少包括 version、owner 三元组、`decision: cancelled`、notificationId、五状态 notification、`decidedAt` 和更新时间。

#### 用户决策覆盖（2026-09-01）

**状态**：已结论（由 P0-2 用户决策覆盖原有 confirm 反馈取舍）。

P0-6 原先“confirm 不产生 reminder”的结论只适用于“确认后由 IPC 直接创建 Run”的旧流程。用户改为“confirm IPC 只落盘 workflow，之后由 Agent 调用 `trigger_workflow`”，因此新增一条职责交接信号：

- confirm 成功落盘后，触发 `role: user` 的 `<system-reminder>`，告知主 Agent workflow 已保存，并提示调用 `trigger_workflow`；
- 该消息是执行入口提示，不是 Run 创建结果，也不要求 confirm IPC 等待或保证 Run 已创建；
- cancel 仍使用本题已收敛的 `workflow-decisions` decision record 和 cancel reminder；confirm handoff 不强行并入 cancel decision outbox，也不新增复杂 delivery 状态；
- 若应用在 workflow 落盘后、handoff 或后续 Run 创建前崩溃，workflow 已经持久化，用户可在重启后要求 Agent 再次调用 `trigger_workflow`；这不构成 confirm IPC 的失败；
- 因此“confirm 不产生 reminder”被标记为历史结论并由本段覆盖，最终以“confirm 产生 role=user handoff、cancel 产生 decision reminder”为准。

### P0-7 — agent 生成内容的执行安全边界

#### 第 1 轮

**状态**：继续讨论。

**事实与判断**：agent 生成改变了 Phase1“手写 YAML 可信”的信任前提；完整 YAML 展示只是披露，不是权限授权；Phase1 当前只允许 fresh/freeform、exec、human gate，并对 fresh MCP 有 allowlist，exec 没有 cwd/network/env 沙箱。`confirm: false` 的 exec 在后续复用时不再有人工关卡。

**推荐方向**：在 P0-3 的 execution profile 收窄基础上，拒绝未实现能力；Claude 建议 agent-generated exec 强制 `confirm: true`，并把生成来源放 metadata/decision record、卡片标注 Agent 生成。是否接受这项额外行为约束仍需第 2 轮封口。

#### 第 2 轮

**状态**：继续讨论（Claude 指出核心选择尚不能由仓库事实唯一推出）。

**事实与判断**：当前争议是 agent 生成的 `exec` 是否必须强制 `confirm: true`。A 方案保守且会保留每次执行的人类关卡；B 方案允许后续自动复用，但仅靠卡片/警告无法等价提供授权。Claude 建议 A，但将其标记为产品安全策略选择，尚未形成结论。

**已收敛的硬边界**：继续沿用 Phase1 execution profile；不新增 YAML `source` 字段；proposal metadata/decision record 记录 agent-generated 来源，提案卡明确标注；cwd 不得超出既有 Workspace resolver，拒绝绝对路径/越权路径；环境变量只允许既有安全基础集合，不注入集成凭据；不假定已有网络沙箱，不在本题偷偷引入网络隔离；MCP/tool 仅允许 Phase1 已有的 `fyllo-specs`/`fyllo-cortex` 边界，其他工具和未实现 Action 拒绝。

**主持问题**：在不先决定 `confirm` 策略的情况下，哪些安全不变量可以独立封口？需要把“能力预检、MCP allowlist、cwd、env、网络、审计、卡片标注”分别落到什么层？

#### 第 3 轮

**状态**：待人工审阅（核心产品选择仍无法由现有事实推出）。

**结论摘要**：Claude 明确列出可直接实施的硬不变量：在 proposal 前做 execution-profile 预检；fresh Agent 的 MCP 仅允许 `fyllo-specs`/`fyllo-cortex`；cwd 沿用 Workspace resolver 并拒绝绝对路径和 `..`；exec 环境只保留系统基线且不传 integration 凭据；Phase1 无网络沙箱，必须在 schema/卡片明示；审计信息放独立 metadata/decision record，卡片标注 Agent-generated。`confirm: false` 是否允许仍有 A（强制 true）、B（允许 false+警告）、C（仅禁止 update 改变）三种行为契约。

**主 Agent 复核**：上述七类边界与 confirm 取值相互独立，可以作为后续设计的硬约束；但“强制 true”不是由 `preflight.ts` 或 Phase1 手写 YAML 事实自动推出的规则，必须保留为行为契约选择。

#### 第 4 轮

**状态**：待人工审阅。

**结论摘要**：Phase2 草案第 5.1 节“无需强制 `confirm: true`”只是尚未批准的新增契约，不能当作 Phase1 的必然延伸；为此增加 checkbox 等中间方案同样会改变确认 UI 和授权语义，不能假装是技术折中。第 4 轮仍无法唯一选择 A/B/C。

**主 Agent 复核**：本轮排除了“先做一个 checkbox/警告，之后再决定语义”的伪收敛方式；checkbox、warning、update 差异提示都会改变授权 UI 和用户可见行为，因此必须在 proposal 前选定。硬边界可以记录，但不能据此默认为 A、B 或 C。

#### 第 5 轮

**状态**：待人工审阅（本题封口）。

**精确人工决策**：是否允许 agent 生成的 `ActionStage(op: exec)` 设置 `confirm: false`。选择 A 会保证复用时仍有人工关卡，但放弃“一次审阅后自动执行”；选择 B 保留草案的自动复用方向，但依赖确认卡片警告作为授权；选择 C 只保护 update 不改变既有确认策略，create 仍允许自动执行。三者都会改变安全/行为契约，无法由当前规范与 Phase1 事实唯一推出。

**人工决策前的硬边界**：能力预检、MCP/cwd/env/网络边界、审计字段和卡片 Agent-generated 标注可先写入设计；但不得创建依赖该选择的 Phase2 proposal、`propose_workflow` 实现或确认卡片策略 UI。确认策略确定后，按所选分支验收对应的拒绝或自动执行行为。

**本题的人工交接格式**：人工只需决定“agent-generated `exec` 是否允许 `confirm: false`”，并选择 A/B/C；同时记录决策人、日期、理由和对应验收分支。若选择 A，proposal 预检拒绝 `confirm:false`；若选择 B，卡片必须警告且复用时允许自动执行；若选择 C，update 必须比较原/新 `confirm` 策略，create 仍按新建规则处理。未作出选择前，三种行为都不能写成已批准契约。

**Claude 曾建议的七项硬不变量（历史记录，不作为本次 P0-7 的准入条件）**：

1. `propose_workflow` 在临时落盘前执行 Phase1 execution-profile preflight；失败不写 proposal、不触发 wake。
2. fresh Agent 的 MCP 仅允许 `fyllo-specs` 和 `fyllo-cortex`；`skills` 与未实现 Action 均拒绝。
3. `exec.cwd` 必须通过 Workspace resolver，拒绝绝对路径、`~` 和 `..` 越权；执行时再次校验解析后的路径。
4. exec 子进程只继承系统基线环境，不注入 workspace integration 凭据。
5. Phase1 没有网络沙箱；schema、提案卡片和 `exec` 说明必须明示命令仍可访问网络。
6. Agent-generated 来源记录在 proposal metadata/decision record，不能未经 schema 演进把 `source` 塞入 YAML 顶层。
7. 卡片显示“由 Agent 生成/更新”、时间、解析后的执行目录和网络风险提示；这些信息披露不等同于 `confirm` 授权。

**主 Agent 说明**：以上七项是 ACP 在用户决策前提出的技术加固建议。用户已明确不把“技术上的完整性”作为 P0-7 的前置条件，因此它们不再单独阻塞 proposal；其中与 P0-3 已确认的 execution profile 重合的部分仍以 P0-3 为准，额外的 cwd/env/网络隔离属于可选后续增强。

#### 用户决策（2026-09-01）

**状态**：已结论（用户确认）；P0-7 不再阻塞 Phase2 proposal。

**用户判断**：Agent 生成 workflow 后，确认卡片会让用户审阅完整 workflow。用户可以在审阅时判断某个 stage 是否适合 `confirm: false`；设置为 `confirm: true` 的 stage 仍在实际执行前要求用户批准。因此，本题不再追求额外的技术完整性，也不把 agent-generated workflow 另行套上比现有 stage 语义更严格的确认策略。

**决策落点**：

- 不新增“agent 生成的 exec 必须 `confirm: true`”规则；不采用选项 A 的强制拒绝；
- 保留 definition schema 和 Phase1 已有的 stage-level `confirm` 语义：`confirm: false` 按用户审阅后的 workflow 直接执行，`confirm: true` 在执行前进入用户批准流程；
- 确认卡片是 agent-generated workflow 的人工 review 边界，完整展示和用户选择构成这次授权，不再另设 checkbox、重复确认或额外“技术完整性”门槛；
- Phase1 execution profile 的权威预检仍然有效，但由 `trigger_workflow` 在运行前执行。该决定只解除 P0-7 关于 `confirm` 策略的额外阻塞，不恢复 Phase1 未实现的 `inherit`、WaitStage、非 exec Action 或其它能力；
- cwd/env/网络等更强的执行加固不作为本题进入 proposal 的前置阻塞。若未来需要更强隔离，另行作为安全增强设计，不回写为本次人工决策的隐含前提。

**主 Agent 复核**：该决定与 ACP 第 5 轮中“允许 `confirm: false`”的分支一致，但不额外承诺该分支曾建议的特定 warning UI；准入依据是用户明确确认“卡片 review + stage-level confirm 已足够”。因此 P0-7 状态更新为已结论；后续 proposal 只需如实保留 review 卡片、`confirm` 字段和 `true` 时的执行前批准，不得再以 A/B/C 争议阻塞 proposal。

**验收边界**：

1. Agent 生成包含 `confirm: false` 的 exec stage 时，proposal 不因该字段被拒绝；确认卡片展示该 stage，用户可审阅后确认。
2. Agent 生成或保存包含 `confirm: true` 的 exec stage 时，实际运行到该 stage 必须进入既有用户批准流程。
3. 不同 stage 可以分别使用 `confirm: false` 或 `confirm: true`，不要求整个 workflow 采用单一策略。
4. 任何超出 Phase1 execution profile 的能力，仍按 P0-3 在 `trigger_workflow` 运行前结构化拒绝；proposal/confirm 不因该能力范围扩大成另一套执行策略。

### P0-8 — system-reminder 与主动提议行为契约

#### 第 1 轮

**状态**：继续讨论。

**事实与判断**：现有 chat system reminder 由 provider 固定拼接 base/workspace/guidelines/knowledge/FylloAction/FylloSignal；Phase1 把 workflow owner 排除在常规 reminder 外。Phase2 需要常驻 workflow 能力提示和取消结果 invisible reminder，但主动提议阈值、抑制条件和确认反馈均未定义。

**推荐方向**：常驻提示放在 chat provider 的 knowledge 后、FylloAction 前；只说明工具存在、调用顺序和“可重复多步骤过程”判断，不把完整 schema 塞入 prompt。decision reminder 走 owner-scoped outbox。Claude 提出至少 3 步、含 gate/分支和复用意图等阈值，但这些仍需收敛，不能直接当成契约。

**主持问题**：常驻 capability 应由哪个 provider 生成、插入现有 system-reminder 的哪个位置？取消 reminder 如何与 proposal owner/outbox 对齐？Agent 何时可以主动提议，哪些场景必须抑制？

**Claude 回复焦点**：Claude 初轮建议在 knowledge 后、FylloAction 前追加能力段，并给出“至少 3 步、含决策点、带复用意图”的主动提议阈值；同时建议 decision outbox 记录 confirm/cancel、可选 24 小时抑制窗口和 workspace `.tmp` 存储。

**主 Agent 复核**：阈值和主动提议属于新增行为契约，不能因为看起来合理就自动批准；confirm reminder、TTL、workspace 根 outbox 也需要与 P0-1/P0-6 对齐。下一轮要求把产品选择与技术事实分开。

#### 第 2 轮

**状态**：继续讨论。

**事实与判断**：Claude 已给出常驻提示放在 chat provider 的 knowledge section 之后、FylloAction contract 之前的具体位置；建议明确首版的当前可执行 profile 为 `fresh + exec + human`，并把主动提议规则写成可验收阈值。P0-3 后续已确认，profile 能力限制由 `trigger_workflow` 的运行时预检负责，常驻提示只需说明当前可执行范围，不应把完整 capability 矩阵前置成 propose 阻塞。当前仍未解决 proposal metadata 是否与 YAML 分离、隐式复用意图是否允许 agent 自行判断，以及取消抑制如何与 P0-1/P0-6 的 session-owned 路径统一。第 3 轮已要求收窄为确定规则，并禁止引用旧的 workspace `.tmp` 路径或任意 TTL。

**主 Agent 复核**：P0-3/P0-5 已经把运行时能力边界收敛到 Phase1 profile，但不要求 propose 阶段拒绝所有 schema 合法的 unsupported definition；trigger 才是执行前的能力闸门。“至少 3 步”和“用户隐式复用意图”仍然会让 Agent 自主改变用户可见行为，不能把建议阈值直接写进常驻 prompt。

#### 第 3 轮

**状态**：已结论（先解决主动提议主观性和 proposal 元数据问题）。

**结论摘要（当时候选，后续被第 5 轮最小默认收窄）**：proposal owner metadata 独立使用 `.meta.json`，不把 frontmatter 混入 Agent YAML；首版只响应显式“保存为 workflow/可复用”要求，不实现 agent 主动提议或询问隐式复用意图；当时曾建议已有 pending/confirming proposal 和 Phase1 active run 时返回结构化拒绝，confirmed/cancelled terminal 记录不阻塞；常驻 capability section 放 knowledge 后、FylloAction 前；cancel 由 Main dispatcher + decision outbox 处理，confirm 在落盘后发送 `role: user` handoff，提示 Agent 调用 `trigger_workflow`。

**本轮收口依据（当时判断）**：显式用户要求有清晰的行为触发点；主动提议/反向询问需要定义“相似流程、用户意图、骚扰抑制”等额外契约，无法从现有 provider 或 schema 推导。故首版只做显式入口；当时曾将 `pending/confirming` 作为同 session 冲突状态，terminal proposal 不阻塞后续提议，后续最小默认取消了 propose 阶段的冲突门槛。

#### 第 4 轮

**状态**：已结论（修正跨题路径和状态判断）。

**结论摘要（当时候选，后续被第 5 轮最小默认收窄）**：decision record 必须沿用 P0-6 的 session-owned 目录和五状态，不使用 workspace 根级 `.tmp` 或 `workflow-decision-outbox`；当时曾建议已有提案按 `.meta.json` 的 `pending/confirming` 状态判断并以结构化错误返回冲突，而不是目录非空；常驻提示只宣传 Phase1 子集和显式入口。

**纠偏记录**：本轮专门修正了第 3 轮之后仍可能被误读的三个点：目录非空不能代表 active proposal，必须读 `.meta.json` 状态；`dispatched`/`delivered` 等 decision 状态不能用“目录删除”伪造完成；`workflow-decision-outbox` 不是最终目录名，统一采用 `workflow-decisions`。

#### 第 5 轮

**状态**：已结论（本题封口；首版最小默认）。

**结论（首版最小默认）**：decision record 使用 `workspaceDataDir/<workspaceId>/sessions/<parentSessionId>/workflow-decisions/<proposalId>.json`，字段与 P0-6 的 version、owner、cancelled decision、notificationId、五状态 notification、时间戳一致；重启时 pending 保持、dispatched 转 `delivery_unknown` 且不重发；parent 删除只把 pending 转 `suppressed`，其它状态不伪造。Phase2 首版只响应显式用户要求，不做主动提议；常驻 provider 顺序和取消 reminder 文本固定；confirm 成功后发送 `role: user` handoff，提示 Agent 调用 `trigger_workflow`，不由 confirm IPC 创建 Run。P0-3 的能力判断由 trigger runtime preflight 负责，常驻提示不应把 unsupported 在 propose 阶段拒绝写成契约。

**与 P0-2 的用户决策对齐**：这里的 confirm handoff 只承担“workflow 已保存、请调用 `trigger_workflow`”的执行交接，不表示 Run 已创建、不由 provider 自动触发执行，也不把 confirm handoff 变成另一套 decision outbox 事务。

**可验收行为**：

- 显式“把这个流程存成 workflow”时，Agent 按 `describe_workflow_schema → propose_workflow` 调用；
- 简单 typo、单条命令、用户标明一次性/特例时，不自动提议；
- 同 session 允许多个 `pending`/`confirming` proposal；首版不在 propose 阶段增加 `session_proposal_conflict`，入口可发现性留给 ActivityBar 后续观察；
- 已有 active Run 不在 propose 阶段返回 `session_run_conflict`，由 `trigger_workflow` 在实际执行时按 Phase1 规则处理；
- 常驻 capability 只放在 knowledge 后、FylloAction 前，宣传 Phase1 子集，不塞完整 schema；
- cancel 通过 Main decision service 投递固定 invisible reminder；confirm 落盘后发送 `role: user` handoff，Agent 再显式调用 `trigger_workflow`，不依赖 confirm IPC 直接创建 Run；
- 不设任意 TTL，pending/dispatched/parent 删除状态转换严格遵循 P0-6。

### P0-9 — EventRail 与 Phase1 WorkflowRunActivityEntry 冲突

#### 第 1 轮

**状态**：已结论（首版最小兼容默认）。

**结论**：Phase1 `workflow-run-inspection` 规范明确要求 Run 作为 `ChatBackgroundActivityBar` 的 sibling entry；Phase2 草案“全部迁移到 ChatEventRail”的表述会直接改写既有行为契约。首版采用保守的 A1：proposal 与 Run 都保留在 ActivityBar，允许共享卡片骨架但分别使用 proposal/run 数据源；不把 Phase1 Run 强制迁到 EventRail，也不在本阶段引入 EventRail contributor/attention 聚合新协议。Phase2 设计第 8.4 节已改写为兼容 Phase1 的双入口方案，proposal 的 owner/discovery 仍按 P0-1 的 proposal IPC 与 session 页面加载处理。

**主持问题**：Phase2 第 8.4 节要求 EventRail 取代 Phase1 Run entry，这是否只是 UI 选择，还是修改了已确认的 Phase1 行为契约？当前 EventRail 是否已有 workflow contributor、store、interest 和 attention 协议可以直接接入？

**Claude 回复焦点**：Claude 读取 linked worktree 的 `workflow-run-inspection` spec、`ChatBackgroundActivityBar`、EventRail 组件和 `useChatEventRail`，确认 Phase1 明确要求 Run 与 SpawnedSession 平级；当前 EventRail 只组合 agenda/proposal/action，没有通用 contributor 接口。它比较了 A1（proposal 与 Run 都留在 ActivityBar）、A2（proposal 在 EventRail、Run 在 ActivityBar）和 B（扩展 EventRail 并迁移 Run）。

**主 Agent 复核**：B 会修改 Phase1 spec、引入新的公共 UI 数据契约和 attention/overflow 语义，不能在 Phase2 proposal 中悄然完成；A2 仍需要额外定义 EventRail contributor，A1 是在不改变 Phase1 行为前提下最小可验收路径。共享卡片骨架不意味着共享 store、owner 或生命周期。本题不再把 proposal 是否进入 ActivityBar 作为未决 blocker，设计文档已采用 proposal/Run 双 sibling entry。

**验收边界**：Phase1 Run 继续在 `ChatBackgroundActivityBar` 展示；proposal 可复用卡片视觉骨架，但必须有独立 proposal 数据源和 owner-scoped list/detail/wake；Phase2 不新增 EventRail contributor/attention 聚合协议，也不修改 `workflow-run-inspection` spec。

## 跨题依赖与决策传播

| 上游题目                   | 传播到                    | 传播内容                                                                                                                               | 当前影响                                                                                                                                                                        |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 owner/discovery       | P0-2、P0-6、P0-8          | proposal 使用 session-owned 路径；所有 decision/reminder 绑定 owner 三元组；Renderer 只能按当前 session list/detail                    | P0-2 的确认落盘目标和 P0-6/P0-8 的 record 路径不能再使用 workspace 根 `.tmp`                                                                                                    |
| P0-3 execution profile     | P0-5、P0-7、P0-8          | `propose_workflow` 只做基本校验；`trigger_workflow` 在运行前负责 Phase1 execution-profile preflight，unsupported 可以先保留在 proposal | P0-5 不需要 workflow turn，inherit 由 trigger 返回 unsupported；P0-7 保留既有 stage-level `confirm` 语义；P0-8 常驻提示说明当前可执行子集，但不把 capability 拒绝前置到 propose |
| P0-4 definition provenance | P0-2、P0-9                | session shadow 与 workspace definition 必须能区分，Run 记录来源；UI 数据源不能把 proposal 文件当 Run snapshot                          | `trigger_workflow` 恢复 Run 时需要读取正确的 definition 来源和 stage 进度；P0-9 的共享卡片不能合并数据所有权                                                                    |
| P0-5 inherit 拒绝          | P0-6、P0-8                | 不新增 workflow turn，不扩展 ChatTurnGate kind；取消 reminder 仍按 notification 投递                                                   | P0-6 只需复用 notification 语义；P0-8 不应把 inherit 写进常驻能力段                                                                                                             |
| P0-6 decision outbox       | P0-8                      | cancel 使用 `workflow-decisions/<proposalId>.json`、五状态和 Main 投递；confirm 使用落盘后的 `role: user` handoff                      | P0-8 的 cancel 路径、重启和 parent 删除规则必须与本题完全一致；confirm handoff 不创建 Run                                                                                       |
| P0-7 confirm 策略          | P0-2、P0-8、后续 proposal | 用户确认由 review 卡片承担，保留 stage-level `confirm:false/true` 语义；`true` 在执行前需要用户批准                                    | 不再因 agent-generated `confirm:false` 阻塞 proposal；仍受 P0-3 execution profile 约束，额外沙箱属于后续增强                                                                    |
| P0-9 UI 挂载               | Phase1 linked worktree    | Phase1 Run 继续在 ActivityBar；Phase2 不反向修改 Phase1 spec                                                                           | 不阻塞 Phase1 在途实施，但要求 Phase2 §8.4 改写                                                                                                                                 |

## 讨论中的纠偏与未采纳方案

下面列出曾在 ACP 回复中出现、但没有进入最终契约的方向，避免后续读者把“Claude 曾经建议过”误读为“项目已经决定”。

| 议题                    | 曾出现的建议                                                                 | 未采纳/纠偏理由                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1/P0-2 proposal 路径 | workspace `.tmp/workflows/<proposalId>.*`                                    | 与 session-owned owner 模型冲突；最终使用 `sessions/<parentSessionId>/workflow-proposals/`                                                                                                                              |
| P0-1/P0-6 清理          | 7 天或 24 小时 TTL                                                           | 没有 correctness 边界，且会让重启/审计行为依赖任意时长；最终随 session 生命周期处理                                                                                                                                     |
| P0-2 并发               | “原子替换就是 CAS”或只按 `proposalId` 加锁                                   | 这是 ACP 曾建议的完整事务防护；用户决定首版不把 target 锁和跨文件恢复作为确认 IPC 的前置条件，Run 由 `trigger_workflow` 统一处理                                                                                        |
| P0-2 回滚               | Run/definition 失败时直接删除 target definition                              | 这是 ACP 曾建议的补偿路径；用户决定确认 IPC 不创建 Run，基本落盘失败直接返回错误，复杂 backup/restore 不作为本题硬性协议                                                                                                |
| P0-2 成功判断           | 只检查 Run 文件是否存在                                                      | 用户将确认成功边界定义为 workflow 已经落盘；Run 是否存在、尚未开始还是进行中，由后续 `trigger_workflow` 根据进度处理                                                                                                    |
| P0-3                    | 扩展 Phase1 以支持完整 schema，或用 `minEngineVersion` 保存不可执行资产      | 会扩大 Phase1 范围或引入未经设计的版本/迁移契约；首版允许 schema 合法 definition 进入 proposal，由 `trigger_workflow` 在运行前拒绝 unsupported                                                                          |
| P0-5                    | 新增 `workflow` ChatTurn kind/通用 turn queue                                | inherit 首版不执行，由 `trigger_workflow` 返回 unsupported；不存在 workflow turn 的真实消费者，未来实现 inherit 时另起设计                                                                                              |
| P0-7                    | agent-generated exec 强制 `confirm:true`、或以额外 checkbox/沙箱补齐技术安全 | 用户明确确认 review 卡片 + stage-level `confirm` 已足够；不新增 agent-specific 强制确认，额外加固不作为本题 blocker                                                                                                     |
| P0-6/P0-8               | confirm 也发送 reminder                                                      | ACP 早期基于“confirm IPC 直接创建 Run”而建议不发 confirm reminder；用户后续改为落盘/执行解耦，因此最终保留一条最小的 `role: user` handoff，提示 Agent 调用 `trigger_workflow`，不创建 Run、不引入新的决策 outbox 复杂度 |
| P0-6/P0-8               | Renderer 直接 claim outbox                                                   | 违反 Main 编排和 owner-scoped outbox 边界；由 Main service/ChatTurnGate claim                                                                                                                                           |
| P0-8                    | 至少 3 步/决策点/隐式复用意图作为首版主动提议阈值                            | 属于新增 Agent 行为契约；首版只响应显式用户要求，不实现主动提议或反向询问                                                                                                                                               |
| P0-8                    | `workflow-decision-outbox`、根级 `.tmp`、按目录非空判断 active               | 与 P0-1/P0-6 的最终路径和状态语义不一致；已改为 `workflow-decisions` 和 `.meta.json` 状态判断                                                                                                                           |
| P0-9                    | 扩展 EventRail contributor 并迁移 Phase1 Run                                 | 会修改已确认 Phase1 行为契约并引入新的 attention/overflow 协议；首版采用 ActivityBar 双入口                                                                                                                             |

## 非阻塞但必须在 proposal 中补齐的事项

这些事项没有改变当前九个 P0 的收敛判断，但不能在后续 proposal 中遗漏：

- P0-1 的 IPC channel、schema、preload 暴露、Main handler 注册和 Renderer list/detail store；
- P0-2 的确认 IPC 基本校验、workflow definition 落盘、`role: user` system-reminder，以及 `trigger_workflow` 对无 Run/未开始 Run/进行中 Run 的创建、启动和 stage 进度恢复测试；ACP 提出的 target 级锁、staged/backup/commit-intent/hash 完整事务方案不属于本阶段必需项；
- P0-3 的 propose 基本校验、`trigger_workflow` execution-profile preflight 与结构化错误码、YAML 路径定位及 schema 示例；不新增 propose/confirm 的完整 capability 双重校验；
- P0-4 的 MCP session context 注入、definition 解析优先级、session workflow 列表边界和定义缺失展示；
- P0-6/P0-8 的 decision record 字段、`WorkflowDecisionService`、FIFO、ChatTurnGate 释放后的重试以及重启/删除测试；
- P0-7 如需更强的 cwd/env/网络隔离，作为后续安全增强另行设计；本次 proposal 必须保留 review 卡片、Agent-generated 标识和既有 stage-level `confirm` 语义，但不因缺少额外技术加固而阻塞；
- P0-9 的 ActivityBar proposal/Run 卡片骨架复用方式，以及 Phase2 §8.4 与 Phase1 spec 的兼容措辞；
- 所有行为变更对应的 OpenSpec capability、guideline 同步和 focused verification。

## 最终收敛结果

| 编号 | 最终结论                                                                                                                                                                          |                轮次 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------: |
| P0-1 | Proposal 采用 session-owned 目录、owner 三元组和独立 proposal IPC；同 session 多窗口可见，跨 owner 隔离                                                                           |                 2/5 |
| P0-2 | 用户确认采用基本校验与职责解耦：confirm IPC 只落盘 workflow 并发送 `role: user` system-reminder；`trigger_workflow` 负责新建、启动和按 stage 进度恢复 Run                         |      5/5 + 用户决策 |
| P0-3 | `propose_workflow` 只做基本校验；`trigger_workflow` 在运行前按 Phase1 execution profile 结构化拒绝 unsupported                                                                    |      2/5 + 用户决策 |
| P0-4 | 以 `(workspaceId, sessionId?, workflowId)` 区分 definition 来源，session shadow 优先解析，Run 保存 provenance                                                                     |                 1/5 |
| P0-5 | 首版不执行 inherit，不新增 workflow turn；schema 合法 definition 可先保存，由 `trigger_workflow` 返回 unsupported                                                                 | 2/5 + P0-3 用户决策 |
| P0-6 | cancel 继续使用 session-owned 五状态 decision reminder；confirm 改为落盘后发送 `role: user` handoff，提示 Agent 调用 `trigger_workflow`，不在 confirm IPC 中创建 Run              |      2/5 + 用户决策 |
| P0-7 | 用户确认 review 卡片承担 Agent-generated workflow 的人工审阅；保留每个 stage 的 `confirm:false/true` 语义，`true` 在执行前要求用户批准，不新增 agent-specific 强制 `confirm:true` |      5/5 + 用户决策 |
| P0-8 | 独立 metadata、显式用户触发、常驻 provider 位置、cancel decision reminder、confirm handoff；不做主动提议或 propose 阶段冲突抑制                                                   |                 5/5 |
| P0-9 | 保留 Phase1 Run 与 proposal 在 `ChatBackgroundActivityBar` 的双入口，不把 Run 强制迁移到 EventRail                                                                                |                 1/5 |

### 历史待人工审阅项与设计同步

P0-2、P0-3、P0-7 已由用户明确收窄。P0-8/P0-9 在 ACP 轮次结束时曾标记为需要用户选择；为完成本次“更新设计文档、让新 Agent 可无阻塞起草 proposal”的任务，Phase2 设计文档采用了不改变既有行为契约的最小默认：

- P0-8：只响应用户明确的保存/复用要求；不实现主动提议、隐式复用和 propose 阶段的额外冲突抑制；active Run 冲突留给 `trigger_workflow`，多个 pending proposal 不强制单队列；常驻 capability provider、confirm handoff 和 cancel decision reminder 按正文所述复用现有路径。
- P0-9：Proposal 与 Phase1 Run 均保留在 `ChatBackgroundActivityBar` sibling entry；共享视觉骨架但不合并 store、owner、wake 或生命周期；不迁移 Phase1 Run 到 EventRail。

这两个默认是范围收敛和 Phase1 兼容处理，不新增产品能力，也不代表引入了额外的用户可见安全承诺。若未来要采用主动提议、EventRail 聚合或更强冲突/attention 策略，应另起设计并重新确认范围。本记录保留原 ACP 轮次和历史建议以便追溯，但当前 Phase2 设计不再把 P0-8/P0-9 作为 proposal 前置 blocker，也不修改 Phase1 linked worktree。

## 阶段性规则

- “已结论”只表示该题形成了可执行、可验证的方案，不表示 proposal 已创建或用户已批准变更。
- “待人工审阅”表示达到第 5 轮仍存在会改变范围、行为契约、所有权或安全边界的选择；主 Agent 不替用户做最终选择。
- 用户在 ACP 讨论结束后作出的明确决策，或为保持既有契约而采用的设计同步默认，可以覆盖历史轮次的“待人工审阅”状态；历史记录保留原状态以便追溯，最终收敛结果以用户决策段、设计同步备注和末尾汇总为准。
- Phase1 linked worktree 的实现进度、剩余 tasks 和既有设计取舍只作为依赖事实记录，不在这里重复决策。
