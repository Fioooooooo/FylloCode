## Context

FylloCode 当前 Chat 阶段通过 system-reminder 强约束 Agent：契约变更必须先创建 Proposal，Apply/Archive 阶段另行执行；非契约变更理论上可直接实现，但当前 Chat reminder 又禁止修改代码，导致中等复杂度的非契约任务缺少合适轨道。

现有基础设施已经具备三个关键复用点：

- `fyllo-specs` MCP server 负责包装工作流 tool，并通过 `FYLLO_SESSION_ID`、`FYLLO_PROJECT_DATA_DIR`、`FYLLO_MCP_EVENT_DIR` 获取会话与项目数据上下文。
- Fyllo action tag 已提供 assistant 输出受控 action、renderer 校验 payload、用户确认后执行 dispatcher、并把 `actionStates` 写入 session meta 的通用机制。
- lineage 已支持 session 与 proposal 的关联，且 `index.sessions` 可以从 `sessionId` 反查 subject。

Plan Tool 应复用这些机制，但避免把轻量 plan 变成新的全局索引实体。

## Goals / Non-Goals

**Goals:**

- 为“不改变外部契约但需要探索和取舍”的任务提供轻量审批轨道。
- plan 文件按 chat session 存储，并可由用户在 Slideover 中审阅、编辑、批准。
- Plan 批准后，Agent 必须重新读取最新版 plan 再实施。
- 将 plan 与当前 session 的 lineage subject 关联，支持从 session lineage 查看该 session 产生的 plans。
- 保持 action shell 扩展性，避免为 `plan.create` 写死特殊状态逻辑。

**Non-Goals:**

- 不把 plan 作为全局可搜索实体，不新增 `LineageIndex.plans`。
- 不支持按 plan slug 全项目反查 subject。
- 不处理现有 ACP 执行计划组件命名冲突；后续单独 proposal 重命名。
- 不把 plan 升级为 proposal 的关系建模为 lineage 边；若后续需要另行设计。
- 不实现工具级写权限隔离；本阶段仍依赖 system-reminder 约束 Agent 在 plan 草稿期不修改业务代码。

## Decisions

### 1. Plan slug 是 session-scoped，不进入全局 index

`create-plan` 接收 Agent 提供的 `slug`，该值不含日期前缀。tool 内部生成完整 slug：

```text
yyyy-MM-dd-<agent-slug>
```

plan 文件路径为：

```text
<FYLLO_PROJECT_DATA_DIR>/sessions/<sessionId>/plans/<fullSlug>.md
```

所有 renderer 读写 IPC 都使用结构化入参 `{ projectId, sessionId, slug }`。`slug` 只在 `sessionId` 作用域内唯一；不同 session 可以拥有相同完整 slug，不冲突。

不新增 `LineageIndex.plans`，理由：

- plan 的实际访问场景都在 Chat session 上下文内，调用方天然知道 `sessionId`。
- 全局 `slug -> subjectId` 反查没有明确产品价值。
- 即使加日期前缀，slug 仍可能在不同 session 中重复。
- 避免引入 `sessionId/slug` 这类复合字符串 key 和对应兼容成本。

### 2. planPath 只存在于 MCP state，不进入 Fyllo action payload

`create-plan` 成功 state 只包含 `planPath`，供 Agent 调研后写入 plan 正文；instruction 作为 `<tool_instruction>` 单独返回。Agent 从 `planPath` 文件名去掉 `.md` 得到完整 slug，并使用调用 `create-plan` 时传入的原始 `goal` 输出：

```xml
<fyllo-action type="plan.create">
{"slug":"2026-06-29-refactor-auth","goal":"需要先审阅多文件实现方案"}
</fyllo-action>
```

payload 不包含 `planPath`。renderer 不能信任 assistant 文本里的本地路径；Slideover 读取 plan 时只能通过 IPC 传 `{ projectId, sessionId, slug }`，由主进程推导路径并限制在该 session 的 `plans/` 目录下。

### 3. Action handler outcome 支持 dismissed

当前 `FylloActionShell` 把 handler `ok: true` 直接映射为 `succeeded` 并写入 session meta。`plan.create` 需要区分“用户打开了审阅界面”和“用户批准了 plan”，因此 handler result 应扩展为通用 outcome：

```ts
type FylloActionHandlerResult =
  | { outcome: "succeeded" }
  | { outcome: "failed"; error: string }
  | { outcome: "cancelled" }
  | { outcome: "dismissed" };
```

Shell 映射：

- `succeeded`：显示完成并写入 `actionStates[actionId].status = "succeeded"`。
- `failed`：显示失败并写入 `failed`，允许重试。
- `cancelled`：显示取消并写入 `cancelled`。
- `dismissed`：回到 `ready`，不写入 session meta。

`task.create` 只需把现有成功/失败结果映射为 `succeeded` / `failed`。`plan.create` 在用户关闭 Slideover 但未批准时返回 `dismissed`；只有用户点击 Slideover footer 的“确认”并且 `approvePlan` 成功后才返回 `succeeded`。

### 4. Plan Slideover 通过领域 composable 打开并等待结果

新增 `usePlanSlideover()`，与 `useProposalDetailSlideover()` 模式一致，内部用 `useOverlay().create(PlanSlideover, { destroyOnClose: true })`。dispatcher 不直接操作 DOM。

`PlanSlideover` 行为：

- 入参为 `{ sessionId, slug, mode }`，其中 `mode` 为 `"review"` 或 `"readonly"`。
- 打开后调用 `lineageApi.readPlan(projectId, { sessionId, slug })`。
- 使用 `UEditor` 以 markdown 模式编辑正文；实时保存调用 `lineageApi.savePlanBody`。
- Footer 在 `review` 模式显示“确认”；点击后调用 `lineageApi.approvePlan`。
- 批准成功后调用 chat store 发送用户消息：`我已确认规划方案：<slug>`，再关闭并向 dispatcher 返回 approved。
- 用户关闭但未批准时返回 dismissed。

### 5. lineage 只在 session link 上记录 plan

新增类型：

```ts
export type LineagePlanLink = {
  slug: string;
  createdAt: string;
};

export type LineageSessionLink = {
  sessionId: string;
  createdAt: string;
  proposals: LineageProposalLink[];
  plans: LineagePlanLink[];
};
```

`normalizeSessionLink` 对历史数据兼容：

```ts
plans: Array.isArray(value.plans) ? normalizePlans(value.plans) : [];
```

`LineageIndex` 保持现状：`tasks`、`sessions`、`proposals`、`commitHashes`、`updatedAt`。`deriveIndexEntries` 不派生 plan 反查项。

### 6. create-plan MCP tool 使用当前 session 上下文

`create-plan` 需要当前 Fyllo session 与项目数据目录，因此要求：

- `FYLLO_PROJECT_DATA_DIR` 必须存在且非空。
- `FYLLO_SESSION_ID` 必须存在且非空。
- 输入参数只包含 `goal` 与 Agent 提供的 `slug` 片段；不接收 `targetPath`、workspace path、local filesystem path 或 `includeInstruction`。
- 响应始终包含 `<tool_instruction>` 与 `<state>`，不提供关闭 instruction 的输入。
- `slug` 必须是 kebab-case 片段，不允许路径分隔符和日期前缀；tool 负责拼接日期前缀。

缺少必要 env 或 slug 非法时，tool 通过 `runTool` 返回带 `state.errors` 的非致命 state，不创建文件。

### 7. MCP plan event 只负责关联 lineage

`create-plan` 创建文件骨架后向 `FYLLO_MCP_EVENT_DIR` 写出 `McpPlanEvent`：

```ts
{
  server: "fyllo-specs",
  tool: "create-plan",
  createdAt: string,
  sessionId: string,
  planSlug: string
}
```

主进程 consumer 解析后调用 `recordPlan(projectPath, sessionId, planSlug)`。若 session 尚无 subject，则先 `ensureChatSubject(projectPath, sessionId)` 再重试。消费成功后删除事件文件。

Plan 内容是否已由 Agent 填完不影响 lineage 记录；lineage 记录的是该 session 创建过该 plan。

## Risks / Trade-offs

- [Risk] Agent 在 plan 草稿期仍可能修改业务代码。→ Mitigation：system-reminder 明确 Plan 阶段只允许调研和写 plan；真正工具级权限隔离作为后续能力。
- [Risk] `dismissed` outcome 改动 action shell 通用行为，可能影响 `task.create`。→ Mitigation：保留 `task.create` 的成功/失败映射测试，新增 dismissed 不持久化测试。
- [Risk] 用户编辑 plan 正文时破坏 frontmatter。→ Mitigation：renderer 只编辑正文，`savePlanBody` 保留 frontmatter；`approvePlan` 只改 status。
- [Risk] session-scoped slug 不能全局查找 plan。→ Mitigation：这是刻意取舍；plan 的产品入口是 Chat session 和 lineage session projection，不提供全局 plan browser。
- [Risk] MCP event 在 plan 正文写完前被消费。→ Mitigation：lineage 只记录 plan 创建事实；Slideover 读取时按当前文件内容展示。

## Migration Plan

- `LineageSessionLink.plans` 是兼容新增字段，读取旧 subject 时默认 `[]`，不需要迁移脚本。
- `LineageIndex` 不变，不需要 index 格式迁移或重建逻辑变更。
- 新增 plan 文件是新目录结构，不影响既有 session meta、messages 或 proposal artifacts。
