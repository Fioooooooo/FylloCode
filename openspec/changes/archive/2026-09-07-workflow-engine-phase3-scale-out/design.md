## Context

当前 Workflow Engine 已经由 `src/main/services/automation/workflow/workflow-engine.ts` 统一拥有 Run 生命周期，definition 使用 Workspace-owned v2 YAML，`yaml-parser.ts` 负责纯解析，`preflight.ts` 负责运行能力预检，`workflow-agent-runner.ts` 和 `workflow-action-runner.ts` 分别负责 fresh Agent 与 `exec` Action。现有 Phase 1 execution profile 只允许 `exec`，Run snapshot 只冻结 definition 和运行状态。

任务读取已经集中在 `src/main/services/automation/task/task-aggregator.ts`，各 provider 通过 `TaskAdapter` 接入；Session meta 已保存 `originTaskRef`，但 `SessionExecutionContext` 尚未把它提供给 Workflow Engine。Yunxiao client 已有 workitem 更新接口，provider credential store 仍以同步明文 JSON 保存。Workflow Editor 目前只编辑 YAML，仓库已直接依赖 `mermaid`，而 Workflow Run Inspector 是独立的运行观察边界。

本 Proposal 只覆盖一个 FylloCode Folder。任务写回和图视图共享 Workflow definition/runtime contract，但保持 provider、workflow runtime 和 renderer Run Inspector 的所有权边界不变。

## Goals / Non-Goals

**Goals:**

- 将可执行 Action 扩展为 `exec`、`write.field`、`write.comment`。
- 从可信 parent Chat session 获取任务，触发时读取一次并冻结可插值的最小 `taskContext`。
- 通过现有 TaskAdapter/TaskAggregator 执行 provider-native 写回，并以 provider capability 在创建 Run 前拒绝不支持的操作。
- 为写回 Action 增加 workflow 目录级的简单成功记录，复用现有 Action 状态、日志和 pass/fail transition。
- 使用 Electron `safeStorage` 保存 provider credentials，并保持现有同步 store API 和路径。
- 在 Workflow Editor 中将已解析 definition 转换为只读 Mermaid 图，展示 stage 与主要 transition。
- 同步共享类型、解析期 schema、runtime preflight、MCP 静态 schema/examples、definition schema reference 和分层测试。

**Non-Goals:**

- 不新增第二套 ProviderRegistry、配置中心、provider plugin 机制或第二个 task read stage。
- 不执行 `write.relation`、`notify`、`git.branch`、`git.commit`、`webhook` 或 `scm.open-pr`；这些操作如保留在 schema 中只作为 trigger preflight 拒绝的合法定义。
- 不保留 `tracker.transition`/`tracker.comment` 兼容转换，不迁移旧 definition 或旧明文 credential。
- 不做 provider 字段发现、语义状态映射、retry/cancel/rollback、锁、claim、pending、TTL 或分布式 exactly-once。
- 不刷新任务、不轮询外部 provider、不重新绑定 task context，不改变现有 MCP tool 数量、trigger input 或 Run Inspector。
- Graph view 不提供拖拽、点击详情、编辑、执行、Run 高亮或 YAML/Graph 双向同步编辑。

## Decisions

### 1. 用小的 Phase 3 execution profile 承接写回

共享 `WorkflowActionOp` 保留现有 `exec`，新增以下两个可执行形态：

```ts
type WorkflowActionOp =
  | { type: "exec"; command: string; cwd?: string }
  | { type: "write.field"; target: "task"; field: string; value: string }
  | { type: "write.comment"; target: "task"; body: string }
  | { type: "git.branch"; name: string }
  | { type: "git.commit"; message: string }
  | { type: "webhook"; url: string; method?: "POST" | "PUT"; body: string }
  | { type: "scm.open-pr"; title: string; body?: string; base: string }
  | { type: "write.relation"; target: "task"; relation: string; ref: string }
  | { type: "notify"; channel: string; recipient: string; body: string };
```

`tracker.transition` 与 `tracker.comment` 从共享类型、parser 和 Agent-facing schema 中删除。其他未实现操作可以被 parser 接受，以保持 definition schema 与 execution profile 分离，但 trigger preflight 必须在创建 Run 前返回 `WORKFLOW_FEATURE_NOT_IMPLEMENTED`，并包含 operation、stage id 等定位信息。Proposal 不为这些操作增加 runtime stub 或伪成功结果。

`write.field` 和 `write.comment` 必须使用 `target: task`、声明 `requires` 包含 `task`，并提供 `idempotencyKey`。字段值保持 YAML 中的 provider-native 字符串，不在 workflow 层定义跨 provider 的状态名映射。`exec` 不因本阶段变化而强制增加幂等键。

**替代方案：**为每种 provider 建立通用状态模型或实现独立 workflow provider registry。该方案会引入字段发现、映射和配置生命周期，超过当前只有一个真实写回 provider 的需求，因此不采用。

### 2. 在服务层读取并冻结 task context，保持 domain 纯度

`yaml-parser.ts` 和 `preflight.ts` 继续只处理 definition 结构和静态 capability。外部任务读取属于 Main service 层：WorkflowEngine 在加载 definition 后，先运行纯 preflight；确认 definition 需要 task 时，再通过可信 parent session context 取得 `originTaskRef`，调用 `TaskAggregator.getTask` 一次，并完成 provider capability 检查，最后才创建 snapshot。

新增的 snapshot 形状使用窄化对象，不冻结完整 `TaskItem`：

```ts
interface WorkflowTaskContext {
  id: LineageTaskRef;
  provider: TaskSource;
  title: string;
  description: string;
  url?: string;
}
```

`id` 保存完整的 source-prefixed task reference，例如 `yunxiao:<spaceId>:<workitemId>`；`description` 使用现有 `TaskDescription.content`，避免模板插值处理对象。`WorkflowRunSnapshot` 新增可选 `taskContext`，旧的无 taskContext snapshot 继续按原 profile reconcile，不需要版本迁移。

`SessionExecutionContext` 增加 parent session 的可选 `originTaskRef`。Agent 不得从 YAML 或 trigger input 覆盖它。`InterpolationContext` 扩展为 `run`、`artifacts` 和冻结的 `task`，Agent prompt、Action 字符串字段与幂等键均使用同一套插值器；Run 创建后不再读取外部任务。

**替代方案：**让每个 stage 启动时重新通过 task id 读取 provider。该方案会导致同一个 Run 内的 Agent、写回和重启恢复看到不同数据，也破坏 snapshot 作为执行边界的作用，因此不采用。

### 3. 扩展现有 TaskAdapter，不引入第二条 provider 路径

在 `src/main/services/automation/task/adapters/task-adapter.ts` 扩展接口：

```ts
interface ProviderCapabilities {
  readonly providerId: string;
  readonly writableFields: string[];
  readonly supportsComment: boolean;
}

interface TaskAdapter {
  list(workspaceId: string): Promise<TaskItem[]>;
  get(taskId: string, workspaceId: string): Promise<TaskItem | null>;
  capabilities(): ProviderCapabilities;
  writeField?(workspaceId: string, taskRef: string, field: string, value: string): Promise<void>;
  writeComment?(workspaceId: string, taskRef: string, body: string): Promise<void>;
}
```

Aggregator 增加 `writeTaskField` 和 `writeTaskComment`，沿用现有 source-prefixed task reference 路由和 `workspaceId`，Workflow runner 只依赖 aggregator/service，不直接 import Yunxiao client。Local/GitHub 返回空 writableFields 且不提供可选写入方法。Yunxiao field write 复用现有 `updateWorkitem`；comment write 复用同一 projex client 的工作项评论接口，body 使用 `content`。官方接口为 `CreateWorkitemComment`：`POST /oapi/v1/projex/organizations/{organizationId}/workitems/{id}/comments`，具体 client 能力未启用时仍将 `supportsComment` 设为 false。

**替代方案：**在 Workflow Engine 内直接分支 `if (provider === "yunxiao")`。该方案绕过 Task domain 的 provider 路由，未来增加 provider 时会复制 workspace/credential/task reference 逻辑，因此不采用。

### 4. 写回复用 Action 生命周期，幂等记录只记录成功

`workflow-action-runner.ts` 保持现有 Action state、output log 和 `action-completed` 事件。新增分支执行以下流程：

1. 使用现有 interpolation resolver 解析 `idempotencyKey` 和 write 字符串字段。
2. 从 `workspaceDataDir(workspaceId)/workflows/<workflow-id>/idempotency.json` 读取 flat map；文件不存在按空 map 处理。
3. key 已有成功记录时跳过 provider request，写入 skip log，并以成功结果推进。
4. key 不存在时通过 TaskAggregator 调用 provider；成功后原子更新 map，失败不写成功记录。
5. 成功以已有 `action-completed`/exitCode 0 语义推进，失败记录错误并以非零结果走现有 fail transition 或 failed 终态。

新增的 idempotency store 只负责读、成功写和原子替换，不实现锁、执行 claim、并发协调、清理策略或 exactly-once 保证。`idempotencyKey` 的作用域为 workflow directory；key 的唯一性由 definition author 负责。

**替代方案：**使用全局数据库、分布式锁或两阶段 provider transaction。当前应用是本地桌面应用且只有单一 workflow owner，这些机制无法合理增加对应价值，因此不采用。

### 5. provider credential store 使用 safeStorage envelope

保持 `provider-credential-store.ts` 的同步调用方式和 `integrations/credentials` 路径。写入时检查 `safeStorage.isEncryptionAvailable()`，将 JSON credentials 经 `safeStorage.encryptString` 加密后以 base64 放入：

```json
{ "encrypted": "<base64 ciphertext>" }
```

读取时只有 envelope、base64、解密和 JSON 全部成功才返回 credentials；缺失、旧 plaintext、损坏或解密失败均返回 `{}`，上层显示未连接。safeStorage 不可用时 save 抛错且不写 plaintext。由于当前项目没有需要兼容的线上旧版本，不新增迁移/备份/扫描；重新连接会覆盖文件。

**替代方案：**保留明文并在后续阶段迁移，或同时读写 plaintext 与 encrypted 两种格式。那会延长明文 secret 的生命周期并增加迁移分支，不符合当前项目阶段，因此不采用。

### 6. Editor Graph 使用单向 definition-to-Mermaid 转换

新增一个位于 workflow-editor feature 内的纯转换模块，将 parser 成功产出的 `WorkflowDefinition` 映射为 Mermaid flowchart。节点至少包含 stage name、id、kind；pass/fail transition 使用不同边样式或标签；循环边标注 `maxLoops`。转换器对节点和边标签做最小 Mermaid 字符转义，不引入手写 HTML 或交互状态。

页面通过 YAML/Graph tabs 切换：YAML tab 继续使用现有 `YamlEditor`；Graph tab 只消费当前解析结果并调用现有 `mermaid` 依赖渲染。YAML 无法解析或渲染失败时显示简单错误状态，不保留旧图。Graph 不接入 Run store、Run wake 或 Workflow Run Inspector。

**替代方案：**引入可拖拽流程编辑器或将 Graph 合并到 Run Inspector。前者会把定义编辑升级为新的双向编译器，后者会混合 definition 与 execution 两个边界，均不符合本阶段的只读可视化目标，因此不采用。

### 7. 统一更新 schema reference 与 Agent-facing 静态资产

同步以下内容，避免 parser、OpenSpec 和 `describe_workflow_schema` 互相矛盾：

- `src/shared/types/workflow.ts` 与 `src/main/domain/automation/workflow/yaml-parser.ts` 的 ActionOp union/校验。
- `src/main/domain/automation/workflow/preflight.ts` 的 Phase 3 profile、task context 和 provider capability 错误。
- `references/designs/workflow-engine/definition-schema.md` 的 ActionOp、模板和幂等规则。
- `src/mcp-servers/fyllo-workflow/src/schema-docs/schema.md`、`examples.md` 的 ActionOp、task 示例和“schema 合法不等于运行时可执行”说明。
- `openspec/specs/workflow-engine/spec.md` 的 Phase 3 execution profile delta。

`fyllo-workflow` 的四个既有 MCP tool、`trigger_workflow` input 和 Workflow Run IPC 不新增 caller-supplied task 字段。task identity 仍由 Host/Main trusted context 提供。

## Risks / Trade-offs

- [旧 tracker definition 无法继续运行] → 明确标记为 BREAKING，不做静默转换或迁移；项目当前没有需要兼容的线上旧版本。
- [旧明文 credentials 读取为空] → UI 按未连接处理，用户重新连接覆盖；不保留明文 fallback。
- [云效评论能力受 client/权限/版本影响] → `supportsComment` 作为唯一开关；能力未启用只拒绝 `write.comment`，不影响 `write.field`。
- [provider-native field value 缺少跨 provider 语义] → 保持 value 原样透传，由 workflow author 使用 provider capability 暴露的字段和值；本阶段不做字段发现和映射。
- [简单幂等记录不保证并发 exactly-once] → 明确只保证单次成功后的重复 key 跳过，不加入锁或分布式事务。
- [Mermaid label 影响图渲染] → 转换器对 stage id/name/edge label 做必要转义，并用 parser 通过的 definition 作为唯一输入。
- [safeStorage 格式使旧版本无法读取新写入的凭据] → 接受该版本边界；没有线上旧版本兼容要求，回退时由用户重新连接。

## Migration Plan

不执行数据迁移。发布后：

1. 新 definition 使用 Phase 3 schema；旧 `tracker.*` definition 不转换、不被新 parser 接受。
2. 新 credential save 只写 safeStorage envelope；旧 plaintext load 返回空 credentials，用户通过既有连接流程重新保存。
3. 旧 Run snapshot 不增加 taskContext 也可继续按原 definition reconcile；只有新的 task workflow Run 写入 taskContext。
4. 新 idempotency 文件按需创建，缺失时按空 map 开始，不扫描或整理既有 workflow 目录。

实施顺序为共享 contract/schema → task context 与 adapter → Action write/idempotency → credential store → Editor Graph → 分层测试和文档校验。每一步都可以在本地测试中验证；不需要新增发布脚本、环境变量或外部服务。

## Open Questions

没有阻塞 Proposal 的开放问题。云效评论接口已经确认存在；实现时只需让现有 projex client 的 endpoint/凭据配置与当前 Yunxiao 部署匹配，若该 client 能力暂不启用则按 `supportsComment: false` 交付。其余并发、迁移、重试和图交互问题明确留到后续阶段。
