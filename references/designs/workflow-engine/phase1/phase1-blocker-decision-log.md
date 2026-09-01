# Phase1 阻塞问题沟通记录

## 参与方与角色

本记录的讨论双方为：

- **主 Agent（Codex）**：负责读取仓库事实、拆分阻塞问题、主持有界沟通、审查建议并整合最终结论。
- **Claude ACP**：作为独立设计评审方，基于仓库文档和代码提出方案、指出风险和取舍；不修改仓库文件。

用户是本次讨论的委托方和未决产品选择的最终决策人，不计入与 Claude ACP 的沟通轮次。

## 日期与讨论要求

- **讨论日期**：2026-08-31。
- **讨论范围**：只处理 Phase1 已识别的 B1–B7 七个阻塞问题，不扩展到 Phase2/Phase3。
- **前置约束**：现有 Workflow 没有实际用户，可以直接替换旧模型，不设计迁移、兼容读取或双格式并存。
- **沟通方式**：每次针对单个问题的提问及对应回复计为该问题 1 次；每个问题最多 5 次。
- **收敛规则**：形成可执行、可验证的结论后立即停止该问题的沟通；第 5 次结束仍未收敛则标记为“待用户决策”，停止自动追问。
- **产物规则**：每个问题的轮次、状态和结论先记录在本文档，再将已确认结论同步到 `phase1-execution-design.md`；沟通过程不修改业务代码。
- **证据要求**：方案必须与设计文档、OpenSpec、项目 guideline 和当前代码事实一致；无法确认的内容不得当作既定契约。

## 目的

本文件记录 Phase1 执行设计进入实施前，对已识别阻塞问题与 `claude-acp` 的有界沟通结果。它是决策过程记录，不是新的运行时规范；最终结论以 `phase1-execution-design.md` 为准。

## 沟通边界与停止条件

- 本轮只处理下表列出的 Phase1 阻塞问题，不展开 Phase2/Phase3，也不修改业务代码。
- 现有 Workflow 没有实际用户，因此不设计迁移、兼容读取或双格式并存；允许直接替换旧 Workflow 模型。旧代码引用仍属于实施时需要删除或重写的工作量。
- 一次针对某个问题的提问及其对应回复计为该问题 1 次沟通；每个问题最多 5 次。
- 问题形成可执行、可验证的决定后，标记为“已结论”，停止围绕该问题继续沟通，并将结论同步到 Phase1 设计文档。
- 某问题达到第 5 次仍未形成结论时，标记为“待用户决策”，停止自动追问，并将分歧、选项和需要用户选择的内容同步到 Phase1 设计文档。
- 沟通过程中发现但不属于下表的问题只记录为“超出本轮范围”，不自动扩大沟通范围。

## 问题状态

| 编号 | 阻塞问题                                              | 沟通次数 | 状态   | Phase1 同步状态 |
| ---- | ----------------------------------------------------- | -------: | ------ | --------------- |
| B1   | Phase1 明确支持的 YAML/Stage/Artifact/ Gate 子集      |      4/5 | 已结论 | 已同步          |
| B2   | 决策、信号与 Renderer 唤醒/拉取通道                   |      3/5 | 已结论 | 已同步          |
| B3   | `requires`、模板变量与运行上下文来源                  |      3/5 | 已结论 | 已同步          |
| B4   | ACP fresh/inherit 执行语义与重启恢复                  |      4/5 | 已结论 | 已同步          |
| B5   | Run 持久化、并发、原子推进与生命周期                  |      4/5 | 已结论 | 已同步          |
| B6   | Action 执行器、确认、失败、重试与幂等契约             |      3/5 | 已结论 | 已同步          |
| B7   | `fyllo-workflow` MCP、IPC domain 与现有 MCP Host 边界 |      4/5 | 已结论 | 已同步          |

## 沟通记录

### B1 — Phase1 支持子集

第 1 轮建议：只实现 `Agent(context: fresh, produces: freeform)`、`gate: human` 和 `Action(op: exec, confirm: true/false)`；其他 schema 作为“已定义但 Phase1 未实现”。

第 2 轮要求明确“不支持能力”的失败阶段和完整可执行组合矩阵；第 3 轮发现当前验收范围与最小可实施范围存在产品取舍；第 4 轮基于 Phase1 的架构验证目标选择收窄方案。本题已结论：Phase1 只实现 `Agent(fresh, freeform)`、`Action(exec)`、`Gate(human)` 和完整 Transition/maxLoops；inherit、expr/verdict、Wait、结构化 artifact/op、retry/idempotencyKey 延后。合法但未实现的定义在 trigger 预检阶段被结构化拒绝，不创建 run。

### B2 — 决策、信号与唤醒/拉取

第 1 轮建议：复用 wake + pull，新增 workflow 专属 list/detail/wake channel；决策通过 `workflow:run:decide` 推进 Main 状态机。

第 2、3 轮已确认：wake/pull 是通知与查询，decide 是独立命令；start、human gate、Action confirmation 使用细粒度 awaiting 状态和同一 decide 入口。本题已结论，已同步 Phase1。

### B3 — 上下文来源

第 1 轮建议：Phase1 跳过 `requires` 执行校验，只支持 `run.*`，其他上下文变量运行时返回不可用。

第 2、3 轮已确认：Phase1 仅允许无 requires 和 `run.*` 模板引用；其他上下文在 trigger 阶段以结构化错误拒绝，不创建 run，禁止静默跳过或空字符串替换。本题已结论，已同步 Phase1。

### B4 — ACP fresh/inherit 与重启

第 1–3 轮未形成结论；第 4 轮基于“可实施、无迁移”目标封口：Phase1 只实现 fresh，采用提取共享 ACP session/turn 能力 + workflow 独立 runner，不复制 SpawnedSessionManager，也不写入 spawned-session store/notification/list。活跃 ACP turn 重启后不可恢复，标记 `interrupted`；父 session 删除标记 `cancelled`。

### B5 — Run 持久化与生命周期

第 1 轮建议：快照整份原子替换；入口或 engine 层保证每个 parent session 只有一个 active run；重启扫描非终态 run 并标记中断。

评审备注：第 2–4 轮封口为 workspace+parent 复合键、每 Run 串行推进、原子快照、父 session 删除保留并标记 `cancelled`、shutdown 标记 `interrupted`。主 Agent 纠偏：重启时人工等待状态可恢复并保持 `awaiting_*`，只有无 live handle 的进行中 stage 才转 `interrupted`；Phase1 不承诺永久保留，暂不实现自动清理。

### B6 — Action 执行契约

第 1 轮建议：Phase1 只实现 `exec` Action；确认后执行，按退出码走 pass/fail；retry/idempotencyKey 延后。

第 2、3 轮已确认：exec 只使用现有 `command`/`cwd` 字段，不引入无依据的固定 timeout；confirm 使用独立 `awaiting_action_confirmation`，retry/idempotencyKey 在 trigger 预检阶段被拒绝，不创建 run；退出码和输出日志契约已同步 Phase1。本题已结论，已同步 Phase1。

### B7 — MCP/IPC 边界

第 1 轮建议：新增 HTTP-only `fyllo-workflow`，复用 registry、鉴权、workspace context 和生命周期，RPC handler 独立；engine 内部不经 MCP 创建 fresh session。

第 2–4 轮封口为 server-neutral RPC envelope + per-server runtime codec/handler：复用现有 Host 的 proxy、鉴权、backend lifecycle，泛化 IPC 分发并保留 fyllo-spawn codec；新增 fyllo-workflow codec、registry/build/bridge/handler。不能只用 TypeScript 泛型，也不复制第二套 Host。本题已结论，已同步 Phase1。

## 最终收敛结果

| 编号 | 最终结论                                                                                       | 沟通次数 |
| ---- | ---------------------------------------------------------------------------------------------- | -------: |
| B1   | Phase1 收窄为 fresh + exec + human；其余定义能力延后，trigger 预检拒绝未实现能力               |      4/5 |
| B2   | workflow 专属 wake/list/getDetail/decide，细粒度 awaiting 状态，共享 decide 命令               |      3/5 |
| B3   | 仅空 requires 与 run.*；上下文/模板不满足时结构化拒绝，不创建 run                              |      3/5 |
| B4   | 提取共享 ACP turn 能力，workflow 独立 runner；fresh-only；活跃 turn 不可重启恢复               |      4/5 |
| B5   | composite active-run key、串行推进、原子快照；等待态可恢复，活跃执行中断；Run 记录暂不自动清理 |      4/5 |
| B6   | exec 使用 command/cwd、confirm、退出码和日志；无 workflow timeout；retry/idempotencyKey 延后   |      3/5 |
| B7   | server-neutral envelope + per-server runtime codec；Host 共用生命周期，协议 handler 分离       |      4/5 |

所有问题都在 5 次以内形成结论，没有问题进入“5/5 待用户决策”。

## 已确认前提

- Phase1 可以直接采用 v2 Workflow 定义，不需要为旧 Workflow 保留迁移路径。
- 这不意味着可以忽略旧代码引用：Proposal Apply/Archive、旧解析器、旧存储服务、Renderer 编辑器和相关测试需要在实施阶段一并替换或删除。
