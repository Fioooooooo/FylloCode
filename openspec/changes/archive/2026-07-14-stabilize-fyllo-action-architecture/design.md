# Stabilize Fyllo Action Architecture — Design

## Context

当前 Fyllo Action 的实现分散在多个技术目录中，状态持久化和执行流程存在以下事实约束：

- `src/shared/types/fyllo-action.ts` 中 `FylloActionStateStatus` 只有 `succeeded | failed | cancelled`，没有 `ready`；应用重启后，未打开会话无法知道有哪些 pending Action。
- Renderer 通过 `session:chat:setActionState` 向 Main 提交完整 `FylloActionState`（含 `type`、`status`、`updatedAt`），Main 做 last-write-wins 合并，缺少状态机和迁移约束。
- `task.create` 先执行副作用再持久化状态，状态写失败后重试可能重复创建任务；`knowledge.flag` 批量确认通过多个独立 IPC 写入，可能部分成功。
- Shared 的 contract、schema、registry、parser、prompt formatter 分散在 `types/`、`schemas/`、`constants/`、`utils/` 四个文件中，没有形成 capability 边界；Renderer registry 不是编译期穷尽 Record。
- Renderer 代码横跨 `config/`、`utils/`、`composables/`、`components/shared/`，`FylloActionShell` 同时承担 UI、执行状态机和批量持久化；`fyllo-action-rail.ts` 同时遍历消息、解析标签、生成 ID、过滤状态和映射 UI DTO。
- `SessionItem` 没有通用提醒派生边界，未来新增提醒来源时容易直接耦合 Action store。
- `sessionId` 只校验非空；Action state IPC 没有充分绑定发送窗口所属 project；Renderer 提供的 `updatedAt` 被 Main 直接接受。

本设计在 `references/designs/fyllo-action/README.md` 的基础上，明确落地边界、文件位置和迁移顺序，确保行为契约变更可被独立验证。

## Goals / Non-Goals

**Goals：**

- 每个合法 ready Action 至多创建一条持久化 `ready` state，并在重启后驱动 `attentionCount`。
- persisted `ready` / `failed` 以及 assistant message 中已解析但尚未持久化的 pending `ready` Action 计入 attention；`succeeded` 和 `cancelled` 不计入。
- EventRail、Inline 和 Session badge 使用同一套 `requiresFylloActionAttention` / `isFylloActionResolved` 谓词。
- Main 不解析 Markdown、不生成 Action ID、不引入 Markstream。
- Session/listSessions 模型保持不变，不在 Session 上新增持久化 attention 字段。
- `SessionItem` 通过 `useSessionAttention(session)` 消费派生的 attentionCount，不直接包含 Fyllo Action 规则。
- 重复操作不会重复创建 durable 业务对象（task、knowledge capture）。
- Fyllo Action 文件按 capability 聚合，并符合 `guidelines/RendererFeatures.md` 的四层语义、公开入口和依赖方向。

**Non-Goals：**

- 不迁移到基于 `messageId` 的 Action ID。
- 不统一 Main/Renderer assistant messageId。
- 不在启动时全量扫描历史 transcript 回填旧 pending Action。
- 不拆分 SessionSummary 与 SessionDetail。
- 不实现 proposal apply/archive completion 提醒。
- 不实现通用通知中心或 reminder event log。
- 不一次性搬迁所有现有技术目录代码；旧代码通过临时 re-export 保持兼容，最后统一清理。

## Decisions

### 1. Renderer 继续是唯一 Action 解析者

- **Rationale**：Markstream 已经在 Renderer 侧与 Vue streaming 生命周期深度集成，把解析搬到 Main 会引入跨进程同步、重复 parser 和 messageId 对齐问题。
- **Consequence**：Main 信任 Renderer 提交的 `actionId` 和 `type`，但只校验 schema、project ownership、session 归属和合法状态迁移，不验证 Action 是否真实存在于 Markdown。

### 2. 保留当前位置型 Action ID

- **Rationale**：ID 格式 `chat:{sessionId}:{messageIndex}:{partIndex}:{actionOrdinalInPart}` 已覆盖当前需求；切换到 messageId 需要统一 Main/Renderer message identity，超出本次范围。
- **Consequence**：如果未来允许编辑/插入历史 assistant message，需要重新评估位置型 identity。

### 3. Main 负责 Action state application service

- **Rationale**：持久化状态、时间戳、版本和跨项目安全属于 Main 的职责；Renderer 只负责发现、展示和发送命令。
- **Consequence**：新增 `src/main/services/session/action/`；`chat-service.ts` 中现有 `setActionState` 逻辑迁移到这里。

### 3.5. 状态机由 Shared 提供并被 Main/Renderer 共用

- **Rationale**：Renderer 需要在本地判断 `requiresFylloActionAttention` / `isFylloActionResolved` 以及 pending action 投影，Main 需要权威迁移检查；将状态机放在 `src/shared/fyllo-action/state.ts` 可避免两套规则漂移。
- **Consequence**：`applyFylloActionTransition` 和状态谓词位于 `src/shared/fyllo-action/state.ts`，被 Main action-service 和 Renderer selectors 共同导入；不再单独创建 `src/main/services/session/action/action-state-machine.ts`。

### 4. 用命令式 transition 替代完整状态提交

- **Rationale**：Renderer 不应决定 `updatedAt` 和 revision；命令式接口（`succeed` / `fail` / `cancel`）让 Main 拥有状态机权威，并支持 CAS 避免并发覆盖。
- **Consequence**：新增 `registerAction` 用于创建 `ready`；新增 `transitionAction` 和 `transitionActions` 用于状态迁移；`session:chat:setActionState` 在 Phase 3 标记为 deprecated 并委托到 action-service，在 Phase 8 彻底删除。

### 5. `ready` 状态持久化到 session meta

- **Rationale**：只有持久化 `ready`，重启后才能在不打开会话的情况下恢复 attentionCount；持久化 `failed` 的错误信息可保证重启后仍能展示失败原因。
- **Consequence**：`FylloActionStateStatus` 扩展为 `"ready" | "succeeded" | "failed" | "cancelled"`；`FylloActionState` 增加可选 `error?: string` 字段；持久化 envelope 增加 `version: 1` 以支持未来迁移。

### 6. 不做历史会话全量回填

- **Rationale**：启动时扫描全部历史 message JSONL 成本高，且要求 Main 复制 Renderer parser；用户打开旧会话后 Renderer 会 lazy 注册。
- **Consequence**：升级前从未持久化 `ready` 的旧 pending Action，首次打开旧会话后才会重新注册。

### 7. `useSessionAttention` 作为提醒聚合边界

- **Rationale**：把 attention 计算从 `SessionItem` 抽离，未来新增 proposal completion 等来源时无需修改 `SessionItem` props。
- **Consequence**：当前只注册 Fyllo Action contributor；未来 contributor 通过相同接口接入。

### 8. Shared registry 使用穷尽 Record

- **Rationale**：编译期穷尽可以在类型层面保证新增 Action type 时同步更新 registry、schemas、prompt 和 Renderer UI override。
- **Consequence**：`src/shared/fyllo-action/registry.ts` 中 `contracts` 使用 `satisfies Record<FylloActionType, FylloActionContract<FylloActionType>>`。

### 9. `prompt.ts` 只负责静态格式化

- **Rationale**：Prompt contract 是共享行为契约，不应与 UI 文案（title、icon、confirmLabel）混在一起；UI 文案留在 Renderer registry override。
- **Consequence**：`src/shared/fyllo-action/prompt.ts` 输出纯字符串 section；system-reminder provider 决定 section 顺序和总装。

### 10. Renderer feature 按四层语义重组

- **Rationale**：`guidelines/RendererFeatures.md` 已为复杂 feature 定义 model/application/ui/integration 边界；Fyllo Action 具备 streaming 生命周期、状态机、多 UI 入口和 durable 副作用，适用完整四层。
- **Consequence**：`src/renderer/src/features/fyllo-action/` 按 `model/`、`application/`、`ui/`、`integration/` 组织；依赖只允许由外向内。

### 11. `safeSessionIdSchema` 使用限定字符集

- **Rationale**：现有 `sessionId` 格式为 `session-{nanoid(10)}`，只含 `a-zA-Z0-9_-`，本身已拒绝路径分隔符；将其显式写入 schema 可同时防止未来 ID 格式演进引入安全问题。
- **Consequence**：`safeSessionIdSchema` 使用正则 `^[a-zA-Z0-9_-]+$`。

### 12. `transitionActions` 使用 Record 形式的 expectedRevisions

- **Rationale**：数组形式依赖调用方与 `actionIds` 顺序一致，容易因顺序错误导致 CAS 误失败；`Record<actionId, revision>` 与顺序无关，更健壮。
- **Consequence**：`transitionActions` 输入 `expectedRevisions: Record<string, number>`，返回 `Array<{ actionId: string; success: boolean; record?: FylloActionState; error?: string }>`。

### 13. Knowledge flag 使用 dedicated durable-append port

- **Rationale**：直接修改 `chatStore.sendMessage` 的返回类型会影响 `task.create`、`plan confirm` 等其他调用方；通过 dedicated port 只给 knowledge flag 暴露 durable append 确认，可保持其他调用方不变。
- **Consequence**：新增 `sendMessageAndAwaitDurableAppend(parts): Promise<{ messageId: string }>` port，供 knowledge flag handler 注入使用。

### 14. `FylloActionState.error` 长度受限

- **Rationale**：`error` 持久化到 session meta，无上限可能被滥用或导致存储膨胀；1000 个 UTF-16 code unit 足以展示用户可读错误，同时限制存储成本。
- **Consequence**：`error` 字段最大长度 1000，超长时 Main 截断或 schema 拒绝。

## Risks / Trade-offs

- **[Risk] 临时兼容层长期存在** → **Mitigation**：在 `tasks.md` 中把删除旧 re-export、旧 registry 和旧 rail DTO 依赖设为 Phase 8 的明确任务，并在每个 phase 的验收标准中检查是否引入新的深路径导入。
- **[Risk] `ready` 注册与 Renderer streaming 展示顺序不一致** → **Mitigation**：注册在 parseResult 进入 `ready` 后立即触发，但 UI 展示不等待 IPC 返回；注册失败时保留 Action UI，并提供可重试的同步状态。
- **[Risk] 批量 `transitionActions` 部分失败导致 attention 与业务状态不一致** → **Mitigation**：Main 在一次 session meta patch 中原子完成批量更新；返回明确的 per-action 结果，Renderer execution controller 据此区分“业务副作用成功、状态同步失败”并只重试 transition。
- **[Risk] 旧版应用读取新版 `ready` actionStates 后行为异常** → **Mitigation**：旧版 schema 中 `fylloActionStateStatusSchema` 只接受 `succeeded | failed | cancelled`，但 persistence envelope 和 legacy decoder 设计由本提案负责；旧版本代码在升级后不再运行，回滚场景通过版本 envelope 降级处理。
- **[Risk] Feature 边界 lint 规则无法表达合法依赖** → **Mitigation**：先调整 public entry、port 或 composition root；确需修改规则时，修改的仍是可适用于所有 feature 的语义规则，不针对 `fyllo-action` 开白名单。
- **[Risk] 单 umbrella proposal 体量过大** → **Mitigation**：按 Phase 划分任务批次，每个 phase 有独立的可验证验收标准；apply 阶段可以按 phase 分批实施，但契约和边界在一个 proposal 中统一。

## Migration Plan

1. **Phase 1 — 规范与回归基线**：创建 OpenSpec specs；为现有 parser、Rail、Shell、state persistence 建立回归测试，确保后续重构有保护网。
2. **Phase 2 — Shared capability 重组**：创建 `src/shared/fyllo-action/`；迁移 protocol、schemas、registry、parser、identity、state、prompt；提供临时 re-export。
3. **Phase 3 — Main Action service**：新建 `src/main/services/session/action/`；实现 registerAction、transitionAction、transitionActions、state machine、CAS、sender/project 校验、version envelope。
4. **Phase 4 — Renderer feature 重组**：建立 `src/renderer/src/features/fyllo-action/`；迁移 handlers、Shell、Node、registry override；拆分 execution controller；统一 selector。
5. **Phase 5 — session-attention**：在 `src/renderer/src/features/fyllo-action/` 内实现 session-attention selector 和 `useSessionAttention` composable，通过 `features/fyllo-action/index.ts` 公开导出；SessionItem 内部调用 `useSessionAttention(session)`。
6. **Phase 6 — 执行一致性**：task.create idempotency、task store lock + atomic write、knowledge durable append、batch transition、project/session 切换竞态修复。
7. **Phase 7 — Prompt 与可靠性**：system-reminder 安全编码、空 knowledge block、knowledge candidate JSON 边界、autosave rejection/flush。
8. **Phase 8 — 清理**：删除旧兼容 re-export、重复 registry、旧 rail DTO 依赖；增加 ESLint feature boundary；测试目录镜像新结构。

## Open Questions (Resolved)

- **`session:action:*` 作为独立 area**：已确认独立 area。channel 为 `session:action:registerAction`、`session:action:transitionAction`、`session:action:transitionActions`，与 `session:chat:*` 分开。
- **`transitionAction` 的 `fail` 命令携带错误信息**：已确认 `fail` 命令可携带可选 `error?: string`，由 Main 校验后写入 `FylloActionState.error` 并持久化到 session meta，使错误在 remount / 重启后仍可展示。
- **`session-attention` 作为 `fyllo-action` 的公开能力**：已确认先作为 `src/renderer/src/features/fyllo-action/` 内部模块实现，通过 feature 的 `index.ts` 公开导出；未来出现第二个 reminder 来源并迁移 session chat 相关能力到 features 时，再考虑独立为 `session-attention` feature。
