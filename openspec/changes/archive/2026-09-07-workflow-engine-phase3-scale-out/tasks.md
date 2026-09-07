## 1. 共享 Workflow contract 与 schema

- [x] 1.1 修改 `src/shared/types/workflow.ts`：新增 `WorkflowTaskContext`，将 `WorkflowRunSnapshot` 扩展为可选 `taskContext`，新增 `write.field`/`write.comment`/`write.relation`/`notify` ActionOp，移除 `tracker.transition`/`tracker.comment`，并保持 `exec` 与既有运行状态类型不变；验收：TypeScript 类型能表达 Phase 3 示例，旧 tracker op 无法通过 union。
- [x] 1.2 修改 `src/main/domain/automation/workflow/yaml-parser.ts`：同步 Phase 3 ActionOp 解析、`target: task`、`task.*` 模板声明和 `write.*` 的 `idempotencyKey` 结构校验；保留 schema 合法与 runtime capability 分离，验收：合法但未实现的 operation 可被保存，tracker op 和缺少必要字段的 write op 返回定位明确的 validation error。
- [x] 1.3 修改 `src/main/domain/automation/workflow/preflight.ts`：允许空 `requires` 与含 `task` 的 definition，允许 `task.*` 模板、`exec`/`write.*`，并对未实现 operation、缺少 task context、provider capability、非法 field 和幂等键返回现有结构化错误；验收：preflight 在创建 Run 前完成拒绝，不启动 ACP 或 Action 资源。
- [x] 1.4 修改 `src/main/domain/automation/workflow/template-interpolator.ts` 及其测试：将冻结的 `task` 纳入 `InterpolationContext`，支持 `task.id`、`task.provider`、`task.title`、`task.description`、`task.url`；验收：description 按字符串插值，不把 `TaskDescription` 对象原样传入 prompt、Action 或 idempotency key。
- [x] 1.5 同步 `references/designs/workflow-engine/definition-schema.md`、`src/mcp-servers/fyllo-workflow/src/schema-docs/schema.md` 和 `src/mcp-servers/fyllo-workflow/src/schema-docs/examples.md`：移除 tracker 示例，加入 write/task 示例，说明 Phase 3 可执行 profile 与 schema-legal/trigger-rejected operation 的区别；验收：`describe_workflow_schema` 返回内容不再指导 Agent 使用 tracker op，且示例包含 provider-native value 与幂等键。

## 2. 可信任务上下文与 Run snapshot

- [x] 2.1 修改 `src/main/services/session/chat/chat-service.ts` 的 `SessionExecutionContext` 和 `getSessionExecutionContext`：暴露已有 `SessionMeta.originTaskRef`，不接受调用方自报 task id/provider；验收：拥有 origin task 的 Chat context 能返回完整 reference，没有 origin task 时返回 undefined。
- [x] 2.2 修改 `src/main/services/automation/workflow/workflow-engine.ts` 的依赖、`triggerWorkflow` 和 snapshot 组装流程：在纯 definition preflight 后按需通过 `TaskAggregator` 读取一次任务，构造窄化 `WorkflowTaskContext`，完成 provider capability preflight 后再原子创建 snapshot；验收：缺少 originTaskRef、任务读取失败或 provider 未配置时无 runId、无 Run 目录和无执行资源。
- [x] 2.3 更新 `src/main/services/automation/workflow/workflow-agent-runner.ts` 与 `workflow-action-runner.ts`：从 Run snapshot 读取 taskContext 并传给统一 interpolation resolver；验收：stage 推进和重启恢复不再次调用 TaskAggregator，Agent/Action 使用同一份冻结值。
- [x] 2.4 为 task context 补充 `test/main/services/automation/workflow/workflow-engine.spec.ts`、`test/main/services/automation/workflow/workflow-agent-runner.spec.ts` 和模板插值测试：覆盖 trusted originTaskRef、窄化 description、无 context 拒绝、外部 task 改变后仍使用 snapshot 值。

## 3. TaskAdapter 与 Yunxiao 写回

- [x] 3.1 修改 `src/main/services/automation/task/adapters/task-adapter.ts`：新增 `ProviderCapabilities`、`capabilities()`、可选 `writeField()`/`writeComment()`；为 local/GitHub adapter 返回空 writableFields 和 `supportsComment: false`；验收：既有 list/get 行为和 workspaceId 路由不变。
- [x] 3.2 修改 `src/main/services/automation/task/task-aggregator.ts`：新增 `writeTaskField` 与 `writeTaskComment`，复用现有 source-prefixed task reference 解析、adapter 选择和 workspaceId；验收：Workflow runner 只需调用 aggregator，不能绕过 Task domain 直接依赖 provider client。
- [x] 3.3 修改 `src/main/services/automation/task/adapters/yunxiao-task-adapter.ts` 与 `src/main/infra/integration/yunxiao/projex/index.ts`：复用 `updateWorkitem` 实现 native field write，接入官方 `CreateWorkitemComment` endpoint 实现 comment write，并依据 client 能力返回 supportsComment；验收：field 原值以 `{ [field]: value }` 传递，comment body 使用 `content`，未启用 comment client 时 capability 为 false。
- [x] 3.4 补充 `test/main/services/automation/task/**` 与 `test/main/infra/integration/yunxiao/**` 的 adapter/client 测试：覆盖 reference 解析、workspaceId/organizationId 传递、native field value、comment endpoint、local/GitHub 不可写和 provider failure。

## 4. Write Action 与幂等记录

- [x] 4.1 修改 `src/main/services/automation/workflow/workflow-action-runner.ts`：在现有 exec 分支旁增加 `write.field`/`write.comment` 分支，解析 task/template 字段，调用 TaskAggregator，复用 actionState、Action output log 和 `action-completed`；验收：成功使用 exitCode 0 走 pass，provider 失败记录错误并走已有 fail transition，不产生伪成功结果。
- [x] 4.2 修改 `src/main/infra/storage/workspace-paths.ts` 与 `src/main/infra/storage/workflow-run-store.ts` 或同层新增 idempotency store：提供 `workspaceDataDir/<workflow-id>/idempotency.json` 路径、flat map 读取和 `writeFileAtomicSync` 原子成功记录；验收：文件缺失按空 map，记录包含 executedAt/runId/stageId，失败不写成功记录。
- [x] 4.3 将幂等检查接入 write Action：resolved key 命中时跳过 provider 并记录 skip log，首次成功后才写 record；验收：exec 不被强制要求幂等键，write.* 缺 key 在 preflight 被拒绝，既不引入锁、claim、TTL，也不声称并发 exactly-once。
- [x] 4.4 补充 `test/main/services/automation/workflow/workflow-action-runner.spec.ts`、`test/main/infra/storage/workflow-run-store.spec.ts` 和 preflight 测试：覆盖首次成功、重复跳过、provider failure、pass/fail transition、原子记录和 task 模板 key。

## 5. Provider credential safeStorage

- [x] 5.1 修改 `src/main/infra/storage/provider-credential-store.ts`：保持现有同步 load/save/clear API 与路径，使用 `safeStorage.isEncryptionAvailable()`、`encryptString` 和 base64 envelope 保存；safeStorage 不可用时 save 抛错且不写明文，旧 plaintext/缺失/损坏/解密失败 load 返回空 credentials。
- [x] 5.2 补充 credential store 与 provider service 测试：mock safeStorage 覆盖加密 envelope、明文不泄露、不可用拒绝、旧格式按未连接处理和 reconnect 覆盖；验收：不增加迁移、扫描、备份或自动删除逻辑，既有 provider service 同步调用无需改成异步。

## 6. Workflow Editor 只读 Graph

- [x] 6.1 在 `src/renderer/src/features/workflow-editor/` 新增纯 definition-to-Mermaid converter（建议放在 model 层）及测试：从 `WorkflowDefinition` 生成节点、pass/fail 边和 maxLoops 标签，最小转义 stage id/name/edge label；验收：中文、特殊字符、重复边和循环定义生成可渲染且不包含旧 Run 状态。
- [x] 6.2 修改 `src/renderer/src/pages/workflow.vue` 与 workflow-editor UI/model：增加 YAML/Graph tabs，Graph 只消费 parser 成功结果，复用直接依赖的 `mermaid` 渲染；验收：切换视图仍操作同一 YAML，Graph 不写 definition、不触发 Run、不接入 Run Inspector。
- [x] 6.3 增加 Graph 解析失败和 Mermaid 渲染失败状态：无效 YAML 不显示旧图，错误状态不影响 YAML 编辑/保存；验收：符合 `UiDesign` 的简短错误提示，且页面不引入拖拽、点击详情或双向图编辑。
- [x] 6.4 补充 `test/renderer/src/features/workflow-editor/**` 与 workflow page 测试：覆盖 tabs、节点/边输出、中文和特殊 label、pass/fail/maxLoops、只读交互、解析失败和渲染失败。

## 7. Contract 对齐与分层回归

- [x] 7.1 对照 `openspec/changes/workflow-engine-phase3-scale-out/specs/**` 更新实现映射涉及的共享/Main/MCP/renderer 测试，确保 `workflow-engine` 的 Phase 3 profile、trusted task snapshot、write capability 和 graph requirements 各至少有对应测试。
- [x] 7.2 检查 `src/mcp-servers/fyllo-workflow/src/schema-docs/**` 被 `workflow-proposal-service.ts` 通过 `?raw` 加载后的实际返回内容，验收：`describe_workflow_schema` 和 `propose_workflow` 仍保持无副作用/仅解析期校验边界，trigger 才做 provider/task preflight。
- [x] 7.3 执行项目已有的 workflow 相关分层质量检查并修复本变更引入的类型、lint、格式和测试问题；验收：不改变 `fyllo-workflow` 四个 MCP tool、Workflow Run IPC channel、fresh Agent allowlist、Run Inspector ownership 和现有 Workspace storage 约定。
