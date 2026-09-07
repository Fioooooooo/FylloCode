# Phase3 Proposal 阻塞问题讨论记录

## 参与方与目标

- **主 Agent（Codex）**：读取仓库事实，拆分 Phase3 阻塞问题，主持有界讨论，复核 Claude ACP 的建议，并维护本记录。
- **Claude ACP**：独立设计评审方，基于仓库文档、OpenSpec、guidelines、Phase1/Phase2 先例和当前代码提出最小可执行方案；不修改仓库文件。
- **用户**：最终决策人。若某个问题讨论满 5 轮仍未形成清晰、简单、可验证的结论，主 Agent 将其标记为“待人工决策”。

本记录的目标是判断 Phase3 是否已经具备创建 Proposal 的条件，而不是直接设计一个过度防御的通用平台。讨论优先采用 Phase1/Phase2 已有的简单边界；不因为尚未发生的极端崩溃、并发或跨 provider 场景引入复杂事务系统。

## 讨论规则

- 每个阻塞问题单独计轮次，一次针对该问题的提问及对应 Claude 回复计 1 轮，最多 5 轮。
- 形成简单、可执行、可测试的结论后立即停止该问题的讨论。
- 第 5 轮仍未收敛，标记为“待人工决策”，不替用户选择。
- 本轮只创建和维护讨论记录，不修改业务代码，不创建、Apply 或 Archive Proposal。
- Claude 回复中的方案只是候选建议；进入“已结论”前必须经过主 Agent 对代码事实、Phase1/Phase2 先例和本轮范围的复核。

## 当前范围修正

用户已确认当前没有线上用户，因此凭证部分不需要旧数据迁移或兼容读取方案。Proposal 可以定义新的 `safeStorage` 存储格式；现有本地明文凭证可视为失效，用户重新连接 provider。仍需讨论新格式、不可用时的简单行为和测试边界，但不讨论迁移脚本或历史数据恢复。

## 参考基线

| 来源                                                                                                                        | 用途                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `references/designs/workflow-engine/phase3-scale-out.md`                                                                    | Phase3 的范围、ActionOp、provider、幂等和图视图设想    |
| `references/designs/workflow-engine/definition-schema.md`                                                                   | `requires: [task]`、`task.*` 模板和 ActionStage 基线   |
| `references/designs/workflow-engine/phase1/phase1-execution-design.md`                                                      | Phase1 的运行时边界、Run 快照、执行与恢复先例          |
| `references/designs/workflow-engine/phase1/phase1-blocker-decision-log.md`                                                  | Phase1 有界讨论和“避免过度防御”的决策先例              |
| `references/designs/workflow-engine/phase2/phase2-agent-generation.md`                                                      | Phase2 的 proposal、执行 profile、确认卡片和时间线先例 |
| `references/designs/workflow-engine/phase2/phase2-blocker-decision-log.md`                                                  | Phase2 的讨论记录结构和用户收敛方式                    |
| `openspec/specs/workflow-engine/spec.md`                                                                                    | 当前 Phase1 行为契约；旧约束需要在 Proposal 中明确替换 |
| `guidelines/Architecture.md`、`guidelines/MainProcess.md`、`guidelines/DataMigrations.md`、`guidelines/RendererFeatures.md` | 架构、主进程、持久化和 renderer 边界                   |

## ACP 会话

| Agent      | Session                                | 状态                                      |
| ---------- | -------------------------------------- | ----------------------------------------- |
| Claude ACP | `fbf8ad75-1338-498d-af8c-fa6fbc3c9e57` | P3-1～P3-7 已完成；各题均在第 1～2 轮收敛 |

## 阻塞问题总览

| 编号 | 阻塞问题                                              | 需要收敛的最小问题                                                      | 状态          |
| ---- | ----------------------------------------------------- | ----------------------------------------------------------------------- | ------------- |
| P3-1 | Phase1 旧契约与 Phase3 ActionOp/profile 的替换边界    | 哪些旧 `SHALL` 被替换；v1 到底执行哪些 op；哪些仍拒绝                   | 已结论（2/5） |
| P3-2 | `requires: [task]` 的任务上下文和 `target: task` 解析 | 任务从哪里来、何时读取、Run 是否冻结、写入目标如何解析                  | 已结论（1/5） |
| P3-3 | TaskAdapter 的 provider 能力与写入接口                | 读写是否复用同一 adapter；`write.field/comment` 的最小接口和能力校验    | 已结论（2/5） |
| P3-4 | `idempotencyKey` 的最小可行语义                       | 记录放哪里、命中/失败怎么处理，以及不引入复杂事务的边界                 | 已结论（1/5） |
| P3-5 | 新的 safeStorage 凭证格式                             | 新格式、读写入口、不可用行为；不讨论旧数据迁移                          | 已结论（2/5） |
| P3-6 | provider Action 的运行时结果与云效评论 API            | provider 成功/失败如何进入现有 Run 状态；评论 API 缺口是否阻塞 Proposal | 已结论（1/5） |
| P3-7 | YAML 图视图的宿主与交互边界                           | 放在哪里、是否点击定位、如何复用现有 Mermaid 而不扩大 UI 范围           | 已结论（1/5） |

## 讨论记录

> 以下按问题追加。每一轮保留“事实与判断、Claude 建议、主 Agent 复核、下一轮问题或结论”。

### P3-1 — Phase1 旧契约与 Phase3 ActionOp/profile 的替换边界

#### 第 1 轮

**状态**：继续讨论。

**Claude ACP 回复**（responseId：`77b75633-3a4e-4da3-874e-a93605dee6e6`）：

- 当前 schema 已声明 `git.branch`、`git.commit`、`scm.open-pr`、`tracker.transition`、`tracker.comment`、`exec`、`webhook`，但当前 runtime preflight 只允许 `exec`。
- Phase3 新增的 `write.field`、`write.comment`、`write.relation`、`notify` 尚未进入共享类型、parser 或 preflight。
- 建议删除旧的 `tracker.transition`/`tracker.comment`，新增 `write.*`，并在同一 workflow spec 中增加 Phase3 execution profile，避免与 Phase1 的“只支持 exec”并列存在。
- Claude 初步建议 v1 通过 `exec`、`git.branch`、`git.commit`、`write.field`、`write.comment`；拒绝 `write.relation`、`notify`、`scm.open-pr`、`webhook`。

**主 Agent 复核**：前两点与当前代码事实一致；删除旧 `tracker.*`、增加 Phase3 profile 也是合理方向。但“本次 v1 是否执行 `git.*` 和 `webhook`”不能由当前代码或设计文档自动推出：Phase3 文档只明确新增落地 `write.field`/`write.comment`，而现有 Phase1 runtime 也没有 `git.*` 或 `webhook` runner。因此暂不接受 Claude 给出的完整支持矩阵。

**主持问题**：基于当前 `openspec/specs/workflow-engine/spec.md`、Phase1/Phase2 先例和 `phase3-scale-out.md`，请给出最小的契约替换清单：哪些 Phase1 约束必须被 Phase3 修改，v1 实际支持哪些 ActionOp，哪些合法 schema 仍应在 trigger preflight 被拒绝？不要引入未被当前需求要求的版本协商或复杂兼容层。

**下一轮问题**：请严格区分“Phase3 设计中保留/允许出现在 schema 的 op”和“本次 Proposal 实际实现并通过 trigger preflight 的 op”。特别说明：如果 `git.branch`、`git.commit` 或 `webhook` 不在本次 v1 实现范围内，是否应继续保留为合法但 unsupported 的定义态 op；如果在范围内，请指出设计文档中对应的明确依据和最小实现边界。

#### 第 2 轮

**状态**：已结论。

**Claude ACP 回复**（responseId：`6c767acd-5b21-49d3-99e3-d74472461d4c`）：

- 本次 Proposal 的最小实际可执行集合只包含 `exec`、`write.field`、`write.comment`。
- `git.branch`、`git.commit`、`webhook`、`scm.open-pr`、`write.relation`、`notify` 可以继续保留在定义态 schema，但在 Phase3 v1 的 `trigger_workflow` preflight 中统一返回 `WORKFLOW_FEATURE_NOT_IMPLEMENTED`。
- 删除被 `write.field`/`write.comment` 替代的 `tracker.transition`/`tracker.comment`，不做运行时自动转换。
- 在同一 workflow spec 中追加 Phase3 execution profile，明确 `write.*` 需要 `requires: [task]`，其他保留的 op 仅表示 schema 能表达，不表示当前可执行。

**主 Agent 复核**：接受该最小边界。它与 Phase3 文档“本阶段只落地 `write.field`/`write.comment`”以及当前 runner 只实现 `exec` 的事实一致，也避免把本地 git wrapper、webhook、PR 创建一起扩大到本 Proposal。旧 `tracker.*` 不做兼容转换；由于当前功能尚无线上用户，Proposal 可直接收窄 schema，旧定义不需要迁移。

**最终结论**：P3-1 已收敛，可以进入 Proposal。

**Proposal 验收边界**：

- `exec` 继续沿用 Phase1 行为；
- `write.field`、`write.comment` 是 Phase3 v1 唯一新增的可执行 ActionOp；
- `write.field`/`write.comment` 缺少 `requires: [task]` 时，trigger preflight 返回结构化上下文错误，不创建 Run；
- `git.branch`、`git.commit`、`webhook`、`scm.open-pr`、`write.relation`、`notify` 若仍保留在 schema，则在 trigger preflight 返回 `WORKFLOW_FEATURE_NOT_IMPLEMENTED`，不创建 Run；
- `tracker.transition`、`tracker.comment` 从新 schema 移除，不做运行时转换；
- OpenSpec 中不能再用“ActionStage 只支持 exec”作为 Phase3 的完整描述，必须追加 Phase3 profile，明确“Phase3 新增 write 两类，其他 schema op 暂不执行”。

### P3-2 — `requires: [task]` 的任务上下文和 `target: task` 解析

#### 第 1 轮

**状态**：已结论。

**Claude ACP 回复**（responseId：`e6b74176-d3c5-4328-a16e-f0b3a6244c9c`）：

- `trigger_workflow` 不接受 Agent 传入的 taskId，而是从父 Session 的 `originTaskRef` 获取任务引用。
- Session 未关联任务时，`requires: [task]` 直接返回上下文错误，不创建 Run。
- 触发时调用现有 `taskAggregator.getTask(workspaceId, originTaskRef)`，读取第三方任务一次，并把任务引用、provider 和模板需要的任务字段冻结到 Run snapshot。
- `task.*` 模板使用冻结快照；重启或后续 stage 不重新读取，也不增加 refresh/TTL 机制。
- YAML 中继续只写 `target: task`，运行时从冻结上下文得到真实 provider/taskRef，再由对应 adapter 执行写入。
- Claude 提议 v1 直接使用 provider 原生字段值，不增加语义状态映射配置；同时列出了“任务读取失败”和“provider 未配置”的基础错误场景。

**主 Agent 复核**：接受该最小链路，但不新增独立 `TaskAdapterRegistry`。当前已有 `taskAggregator` 根据任务引用选择 adapter，Proposal 应在现有聚合层之上增加工作流需要的“已解析任务目标”，而不是让 Workflow Engine 直接写云效分支代码。`SessionExecutionContext` 需要补充 `originTaskRef`；Run snapshot 需要保存足够的 task context，使 `task.*` 插值和 Run 恢复不依赖再次 API 读取。

字段值采用 Phase3 文档已经选定的 provider 原生值，不做语义映射。例如 `field: status` 时，`value` 使用云效对应的原生 status id。这样不新增配置文件、映射 UI 或额外 provider 查询。

**最终结论**：P3-2 已收敛，可以进入 Proposal。

**Proposal 验收边界**：

- `requires: [task]` 只允许从绑定了 `originTaskRef` 的父 Chat Session 启动；不允许 Agent 在 trigger 参数中自行指定 taskId；
- 触发时通过现有任务聚合/adapter 读取一次任务；读取结果和真实目标引用进入 Run 上下文；
- 没有任务上下文或无法读取任务时，不创建 Run；
- 没有 `requires: [task]` 的纯本地 Workflow 不触发第三方任务读取；
- 没有显式 `write.field`/`write.comment` stage 时，不调用第三方写入 API；
- `target: task` 是唯一的 YAML 目标表达，provider/task id 由运行时上下文解析；
- v1 不加入任务刷新、轮询、语义字段映射或跨 provider 统一状态层。

### P3-3 — TaskAdapter 的 provider 能力与写入接口

#### 第 1 轮

**状态**：继续讨论。

**Claude ACP 回复**（responseId：`628c5d9b-8f2e-4e8f-a716-ca1cb3047c83`）：

- 继续复用同一个 `TaskAdapter`，在现有 `list/get` 旁增加可选的 `writeField/writeComment`。
- 建议用布尔能力标记表达 v1 是否支持写字段和写评论；local/GitHub 不实现可选写入方法，云效实现两者。
- Workflow runner 不直接导入云效 adapter，而是调用 task aggregator 的 `writeTaskField/writeTaskComment` 代理，由任务引用前缀复用现有 adapter 路由。
- Claude 建议写入方法接收 `taskRef`，由具体 adapter 自己解析 provider 专属的 space/workitem id；不新增平行 ProviderRegistry 或通用 `execute(op)` 接口。

**主 Agent 复核**：复用 adapter、通过 aggregator 代理和让 provider 自己解析 taskRef 均符合现有边界。但两个细节不能直接接受：

1. Phase3 文档已经把 `writableFields` 作为 provider capability，并要求 runtime preflight 校验具体 field；只用 `supportsWriteField: boolean` 会失去字段级校验，扩大任意字段写入范围。
2. 当前读取 API 明确携带 `workspaceId`，写入也应保留 Workspace 作用域，不能只传 taskRef，否则无法保持现有 Workspace/挂载资源边界。

**下一轮问题**：请在“不引入 registry/插件系统”的前提下，给出一个与 Phase3 文档一致的最小 capability 和写入方法签名：保留字段级 `writableFields`，补充评论能力，并说明 `workspaceId` 如何传递；同时确认 local/GitHub 如何简单表达不支持。

#### 第 2 轮

**状态**：已结论。

**Claude ACP 回复**（responseId：`5b4f58a3-12ab-4330-b730-32c6208b210d`）：

- `ProviderCapabilities` 保留 `providerId`、`writableFields` 和 `supportsComment` 三个最小字段。
- `TaskAdapter` 的可选写入方法接收 `workspaceId`、`taskRef` 和操作参数；adapter 自己解析 provider 专属 taskRef。
- `task-aggregator` 新增 `writeTaskField`/`writeTaskComment` 代理，复用现有 taskRef 路由；runner 不直接引用具体 provider。
- trigger preflight 在已读取任务后检查 `field ∈ writableFields` 或 `supportsComment`；不满足返回 `WORKFLOW_FEATURE_NOT_IMPLEMENTED`，不创建 Run。
- local/GitHub 返回空字段能力和 `supportsComment: false`，不实现可选写方法。

**主 Agent 复核**：接受该形状。字段级能力列表是当前设计要求的简单契约检查，不属于过度防御；Workspace 参数也保留了现有任务服务的资源边界。`writableFields` 只表达 provider 级 v1 能力，不扩展为项目字段发现或映射系统。

**最终结论**：P3-3 已收敛，可以进入 Proposal。

**Proposal 验收边界**：

- 读写继续共用 `TaskAdapter`，不新增平行 ProviderAdapter、registry 或插件系统；
- 云效 adapter 提供 `writeField(workspaceId, taskRef, field, value)` 和 `writeComment(workspaceId, taskRef, body)`；
- local/GitHub 通过空 capability 表示不支持；
- `write.field` 的 field 不在 `writableFields` 时，在 trigger preflight 被拒绝；
- `write.comment` 在 `supportsComment` 为 false 时，在 trigger preflight 被拒绝；
- provider 内部负责解析 taskRef 和调用具体 API，workflow runner 不包含 provider 分支。

### P3-4 — `idempotencyKey` 的最小可行语义

#### 第 1 轮

**状态**：已结论。

**Claude ACP 回复**（responseId：`5e412112-8992-4734-8f51-8ba289910dc1`）：

- 采用设计文档中的 workflow 级 `idempotency.json`，记录 `resolvedKey → executedAt/runId/stageId`。
- Stage 启动时插值 `idempotencyKey`；命中则记录 action log、直接判定 pass；未命中则调用 provider，成功后写入记录；失败不写记录。
- `write.field` 和 `write.comment` 必须声明 `idempotencyKey`；`exec` 不要求。
- 不增加 claim、lock、pending 状态、两阶段提交、TTL 或 provider-specific 幂等协议。
- 明确不承诺并发 Run 的 exactly-once，也不承诺 provider 端真实只执行一次。

**主 Agent 复核**：接受该简单保证。这里的幂等是本地 workflow 级的“成功记录后跳过后续相同 key”，不是外部 API 事务保证。记录必须使用现有 workspace path helper 和原子写入原语；不为 provider 调用成功但本地记录尚未写入的窗口新增恢复系统。

需要在 Proposal 中把 `idempotencyKey` 的归属写成 ActionStage 字段（不是 ActionOp 字段），并把“并发重复调用属于已知限制”写入 scenario，避免实现或测试误读为 exactly-once。

**最终结论**：P3-4 已收敛，可以进入 Proposal。

**Proposal 验收边界**：

- 路径为 Workspace/workflow 级 idempotency 文件，跨 Run 共享；
- resolved key 在 stage 启动时使用现有模板插值规则生成；
- 命中跳过 provider 调用并推进 pass；
- 只有 provider 调用成功后才写入记录；失败不写；
- `write.field`/`write.comment` 缺少 ActionStage `idempotencyKey` 时，trigger preflight 拒绝且不创建 Run；
- 不增加并发锁、pending 状态、外部 exactly-once 或自动恢复承诺。

### P3-5 — 新的 safeStorage 凭证格式

#### 第 1 轮

**状态**：继续讨论。

**Claude ACP 回复**（responseId：`61ffaf8a-b09e-4085-af6e-30c191c0c8c9`）：

- 新文件保存 `{ encrypted: base64(safeStorage.encryptString(JSON.stringify(credentials))) }`。
- `safeStorage` 不可用时禁止明文降级；保存操作报错，读取按未连接处理。
- 解密失败按未连接处理，用户重新连接；不做备份、自愈或迁移。
- Claude 建议启动时扫描并删除没有 `encrypted` 字段的旧明文文件。
- 通过 mock `safeStorage` 验证加密保存、解密读取、损坏文件、缺失文件和不可用场景。

**主 Agent 复核**：加密 envelope、禁止明文 fallback 和“重新连接”方向可接受。但当前 [`provider-credential-store.ts`](/Users/tao/Work/projects/FylloCode/src/main/infra/storage/provider-credential-store.ts:17) 的 `loadCredentials/saveCredentials/clearCredentials` 是同步接口，Proposal 不应无理由把全链路改成异步；现有 provider service 也依赖 `loadCredentials()` 返回空对象表示未连接。启动扫描并删除所有旧文件也不是本题必要条件，读取到无 `encrypted` 字段时按无效凭证处理即可。

**下一轮问题**：在保留现有同步 store API 的前提下，请给出最小修正版：safeStorage 不可用、缺失文件、旧明文/损坏文件和保存时的行为；确认是否不需要启动扫描、version、备份和迁移脚本。

#### 第 2 轮

**状态**：已结论。

**Claude ACP 回复**（responseId：`5f9a38c4-b919-4476-a0c4-37e12a44bead`）：

- 保持 `loadCredentials/saveCredentials/clearCredentials` 的同步接口。
- `saveCredentials` 检查 `safeStorage.isEncryptionAvailable()`，用 `encryptString(JSON.stringify(credentials))`，将 base64 结果写成 `{ encrypted: string }`，不可用时抛错且不降级明文。
- `loadCredentials` 对缺失文件、safeStorage 不可用、旧明文格式、损坏或解密失败统一返回 `{}`，保持现有 provider “未连接”判断。
- 旧明文只按无效凭证处理，不启动扫描、不删除、不迁移；用户重新连接时原子覆盖。
- 不增加 `version`、备份、自愈或 migration script。

**主 Agent 复核**：接受该修正版。它保持现有同步调用链，避免把“没有线上用户”误解为需要新增启动清理流程；同时禁止明文 fallback。Proposal 只需说明新格式不兼容旧文件，旧文件被当作未连接，重新连接时覆盖。

**最终结论**：P3-5 已收敛，可以进入 Proposal。

**Proposal 验收边界**：

- 所有 provider 继续通过同一个同步 credential store；
- 新文件内容为 `{ encrypted: base64(safeStorage.encryptString(JSON.stringify(credentials))) }`；
- 保存时 safeStorage 不可用直接失败，绝不写明文；
- 读取异常统一返回空凭证，沿用现有“未连接”语义；
- 旧明文不迁移、不扫描、不删除，重新连接保存时覆盖；
- 测试覆盖加密文件不含明文、round-trip、缺失/旧格式/损坏文件和 safeStorage 不可用。

### P3-6 — provider Action 的运行时结果与云效评论 API

#### 第 1 轮

**状态**：已结论。

**Claude ACP 回复**（responseId：`193e98d8-84df-40f7-be72-95c2b0da4764`）：

- 在现有 `workflow-action-runner.executeAction()` 增加 `write.field`/`write.comment` 分支。
- provider 调用成功复用 `action-completed: pass`；抛错复用 `action-completed: fail`，由现有 state machine 处理 `next.pass`/`next.fail`。
- 不扩展 `WorkflowActionState`；继续使用 `startedAt/endedAt/logPath`，provider 的开始、成功、失败和错误消息写入 action log。
- confirmation、重启、取消沿用 Phase1；不增加 provider-specific retry、取消 HTTP 请求或回滚。
- 云效评论 endpoint 尚未确认不阻塞 Proposal；`write.field` 作为确定能力，`write.comment` 作为实现前 API 验证项。若 API 不可用，云效 `supportsComment` 为 false，trigger preflight 拒绝 `write.comment`。

**主 Agent 复核**：接受运行时复用现有 action 事件、pass/fail 和日志的方案。幂等键属于 ActionStage，不属于 op；provider Action 只需在执行前解析 Stage 上的 key，成功后记录，再推进现有事件。评论 API 的未知不阻塞 Proposal，但 Proposal 必须把“实现前核实 endpoint；核实失败时只交付 `write.field`，`write.comment` 保持 unsupported”写成明确收窄规则，不能把未验证的 endpoint 写成事实。

**最终结论**：P3-6 已收敛，可以进入 Proposal。

**Proposal 验收边界**：

- `write.field`/`write.comment` 复用现有 ActionRunner 和 `action-completed` 事件；
- provider 成功按 pass 推进，provider 异常按 fail 推进，不新增 error/retryable 状态；
- provider action 复用现有 action state 和 log path，只增加可读日志内容；
- `confirm`、Run 恢复、取消和 fail 回边沿用既有语义；
- 云效评论 API 是实现前验证任务；验证失败时关闭 `supportsComment`，不影响 `write.field` 交付；
- 不引入 provider-specific retry、HTTP 取消、回滚或新的运行态协议。

### P3-7 — YAML 图视图的宿主与交互边界

#### 第 1 轮

**状态**：已结论。

**Claude ACP 回复**（responseId：`1f016829-e1b4-484f-b46d-449f62eaa849`）：

- 图视图只放在 `/workflow` 的 Workflow Editor，使用 YAML/图视图 Tab；不改 Proposal Review 的竖向时间线，也不扩展 Run Inspector。
- v1 纯展示，不做节点点击、YAML 行定位、stage 详情弹窗、拖拽编辑。
- 增加一个 `workflowToMermaid(definition)` 转换函数和一个 `WorkflowGraphView.vue` 展示组件，复用现有 Mermaid/MarkStream 基础设施，不引入新图形依赖。
- 每个 stage 生成一个节点；pass 用实线、fail 用虚线，`maxLoops` 作为边标签；prompt/op 详情不放进节点。
- Mermaid 转换和渲染失败显示简单错误状态。

**主 Agent 复核**：接受该 UI 边界。由于 Workflow Editor 没有时间线，Phase3 文档中“点击节点定位时间线”在 v1 没有实际宿主，取消交互是更小且明确的范围。转换函数必须对 stage name 和 transition label 做最小的 Mermaid 字符转义，并使用现有 schema 已验证的 stage id，避免把用户 YAML 文本直接拼成可执行图语法；这属于普通渲染输入处理，不引入新的防御系统。

**最终结论**：P3-7 已收敛，可以进入 Proposal。

**Proposal 验收边界**：

- `/workflow` 编辑器提供只读图视图 Tab；
- 每个 stage 有一个节点，包含 stage name/id 和 kind 标识；
- pass/fail 连线分别使用实线/虚线，回边显示 `maxLoops`；
- 图视图只消费已解析的 WorkflowDefinition，解析失败显示错误，不尝试从无效 YAML 猜测图；
- 节点不可点击、不可编辑，不修改 proposal review 时间线或 Run Inspector；
- 复用现有 Mermaid 依赖，不引入 vue-flow、dagre 或 cytoscape；
- 转换函数有 stage id、中文/特殊字符 label、回边和渲染失败测试。

## 最终汇总

| 编号 | 最终结论                                                                                    | Proposal 处理方式                                                           |
| ---- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| P3-1 | 已结论：v1 只执行 `exec`、`write.field`、`write.comment`                                    | 修改 ActionOp、execution profile 和 trigger preflight；其余保留 op 暂不执行 |
| P3-2 | 已结论：trigger 时读取一次并冻结 task context，写入由显式 ActionStage 触发                  | 补充 Session task ref、Run task context 和 adapter 目标解析                 |
| P3-3 | 已结论：TaskAdapter 复用读写，字段/评论能力由 adapter 声明                                  | 增加 capability、aggregator 写代理和 Workspace-scoped adapter 方法          |
| P3-4 | 已结论：workflow 级成功记录，命中跳过，失败不记录；不承诺并发 exactly-once                  | 增加 idempotency 文件、模板解析、ActionStage preflight 和 action log        |
| P3-5 | 已结论：全 provider 使用新的同步 safeStorage envelope，不做迁移                             | 更新 credential store，旧格式按未连接处理                                   |
| P3-6 | 已结论：provider Action 复用现有 runner/state machine；comment API 作为可收窄的实现前验证项 | 增加 provider action 分支、日志和 success/fail 映射；先验证评论 API         |
| P3-7 | 已结论：图只放 Workflow Editor，v1 静态展示                                                 | 增加 definition-to-Mermaid 转换、展示 Tab 和错误态；不改时间线              |
