## Why

Workflow Engine Phase 2 已建立 definition、Run、Agent/Action stage 和 Run Inspector 的执行边界，但 Action 目前只能执行本地命令，Workflow 结果无法回写到触发它的任务，也缺少定义结构的直观查看方式。Phase 3 以现有 TaskAdapter、Action Runner 和 Mermaid 依赖为基础，补齐最小的任务写回与流程可视化能力，让 workflow 对当前 Workspace 的自动化闭环更完整。

## What Changes

- 将 Workflow execution profile 从仅支持 `exec` 扩展为 `exec`、`write.field` 和 `write.comment`。
- 从可信 Chat parent session 的 `originTaskRef` 获取任务；触发前通过现有 TaskAggregator 读取一次，并将最小任务上下文冻结到 `WorkflowRunSnapshot`，供后续 Agent、Action 和幂等键模板使用。
- 为 TaskAdapter 增加 provider capabilities 及可选任务字段/评论写入能力；复用现有 aggregator 路由和 Yunxiao 客户端。Local/GitHub 保持不可写，Yunxiao 按能力声明支持的字段和评论操作。
- 要求 `write.*` 使用 `requires: [task]`、`target: task` 和 `idempotencyKey`；以 Workspace workflow 目录下的简单 JSON 记录成功写回，命中时跳过重复写入。
- 将现有 `tracker.transition` 与 `tracker.comment` 从 ActionOp 中移除（**BREAKING**），不做旧 definition 转换或迁移。保留其他尚未实现的操作作为 schema 合法但 trigger preflight 拒绝的能力，并返回 stage/feature 定位信息。
- 将 provider credentials 改为 Electron `safeStorage` 加密 envelope（**BREAKING**：旧明文凭据按未连接处理，用户重新连接即可），不增加迁移流程。
- 在 Workflow Editor 增加 YAML/图视图切换；从已解析 definition 生成只读 Mermaid 图，展示 stage、pass/fail 路径和 `maxLoops`，不改变 Run Inspector 或执行流程。
- 同步共享类型、YAML parser/preflight、fyllo-workflow MCP 静态 schema/examples、definition schema reference 与分层测试，使 Agent 看到的 schema 和运行时 profile 一致。

## Capabilities

### New Capabilities

- `workflow-provider-writeback`: 从可信任务上下文执行 provider-native 的任务字段/评论写回，提供 capability preflight、最小幂等记录和加密 provider credentials。
- `workflow-definition-graph`: 在 Workflow Editor 中查看由 workflow definition 生成的只读 Mermaid 结构图。

### Modified Capabilities

- `workflow-engine`: 将 Phase 1 的 exec-only execution profile 更新为 Phase 3 的 `exec`/`write.*` profile，加入冻结任务上下文和写回幂等约束，并移除 `tracker.*` 操作。

## Impact

- Workflow contract：`src/shared/types/workflow.ts`、YAML parser/preflight、template interpolation、`WorkflowRunSnapshot` 和 workflow-engine OpenSpec。
- Main automation：`src/main/services/automation/workflow/**`、`src/main/services/automation/task/**`、`src/main/infra/integration/yunxiao/projex/**`、provider credential store 和 workspace workflow storage。
- MCP schema：`src/mcp-servers/fyllo-workflow/src/schema-docs/**` 及相关 definition schema reference；MCP trigger input 和四个既有 tool 不变。
- Renderer：`src/renderer/src/pages/workflow.vue` 及 workflow-editor feature；Run Inspector 保持独立。
- Tests：补充 domain parser/preflight、task context snapshot、provider adapter、Action Runner、幂等存储、safeStorage、MCP schema 和 Editor graph 的分层测试。
