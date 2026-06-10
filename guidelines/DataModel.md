---
name: DataModel
description: 跨进程共享类型、持久化结构、序列化规则与兼容性约束
keywords: [data-model, shared-types, persistence, serialization]
---

# DataModel

## Purpose

定义 FylloCode 的共享类型、核心实体、持久化元数据结构、消息文件格式以及数据契约演进时必须遵守的兼容性规则。任何涉及 `src/shared/types/`、项目数据目录、JSON/JSONL 结构、跨进程 payload 或默认值语义的工作，都必须先阅读本文档。

## Applicability

- 适用于 `src/shared/types/**`、`src/shared/constants/**`、`src/shared/schemas/**`。
- 适用于 `src/main/infra/storage/**`、`src/main/services/**` 中读写持久化结构的代码。
- 适用于 `data/` 对应的开发数据布局与生产 `userData` 映射。
- 不覆盖 channel 语义与 bridge 公开接口；见 `guidelines/IPC.md`。

## Sources of Truth

- `src/shared/types/**`
- `src/shared/constants/error-codes.ts`
- `src/shared/schemas/ipc/**`
- `src/main/infra/storage/**`
- `src/main/infra/storage/project-paths.ts`
- `src/main/infra/paths/index.ts`
- `src/main/services/**`
- `test/main/infra/storage/**`
- `openspec/specs/project-store-persistence/spec.md`
- `openspec/specs/session-meta-storage/spec.md`
- `openspec/specs/proposal-apply-run/spec.md`
- `openspec/specs/project-lineage-model/spec.md`
- `openspec/specs/integration-providers/spec.md`
- `openspec/specs/global-preferences/spec.md`

## Rules

- MUST: 将跨进程共享的实体、请求/响应类型和核心值对象定义在 `src/shared/types/`，避免前后端各自声明不兼容的同名结构。
- MUST: 将 IPC 入参的运行时校验 schema 与共享类型分开管理；类型放在 `src/shared/types/`，校验放在 `src/shared/schemas/ipc/`。
- MUST: 将项目作用域数据目录通过 `project-paths.ts` 统一寻址，保持 `projects/<encodedPath>/...` 结构稳定。
- MUST: 让持久化文件格式与运行时类型同步演进；当 JSON、JSONL、meta 文件结构变化时，必须同步更新读写实现、测试和相关 guideline。
- MUST: 保持共享响应结构 `IpcResponse<T>`、流式消息结构 `StreamMessage<T>`、错误信息结构 `IpcErrorInfo` 的统一来源，避免局部重定义。
- MUST: 将新错误码加入 `src/shared/constants/error-codes.ts`，并把依赖这些错误码的 IPC 返回值保持为共享联合类型。
- MUST: 在默认值、可选字段、时间戳格式、枚举值含义发生变化时，先判断这是否是行为契约变化；若是，先更新 OpenSpec。
- MUST: 当 proposal 涉及持久化文件 schema 的不兼容变更（字段重命名、类型变更、字段删除、结构调整）时，在 `src/main/migrations/scripts/` 下新增一个独立的迁移脚本，文件名格式为 `YYYYMMDD_NNN_<kebab-case-description>.ts`，并将其追加到 `src/main/migrations/scripts/index.ts` 的 `migrations` 数组末尾（数组顺序须与文件名字母序一致）。迁移脚本须满足：
  - **幂等**：对目标字段/文件不存在、已是新格式等情况须静默跳过，不抛出异常，确保重复执行不产生副作用
  - **可测试**：通过 `MigrationContext.dataPath` 访问数据目录，不直接 import `getDataSubPath` 等全局路径单例
  - 纯缓存文件（`registry-cache.json`、`status-cache.json`）的格式变更无需迁移脚本，因其读取失败时有自动重建路径；账本类文件（`installed.json`、`sessions/*.json`）的格式变更 MUST 提供迁移脚本
- MUST: FylloCode 主动声明的时间字段 SHALL 使用 ISO 8601 字符串（`new Date().toISOString()`），不得使用 Unix 毫秒时间戳数字（`Date.now()`）；TTL 计算 SHALL 使用 `Date.now() - new Date(fetchedAt).getTime() > TTL_MS`。
- SHOULD: 为每种关键持久化结构保留对应的 storage/service 测试，证明序列化与反序列化行为。
- MAY: 在仅限前端展示的局部视图模型中派生附加字段，但不要把这些派生字段反向写进共享持久化结构。

## Examples

- Good: `src/shared/types/ipc.ts` 统一定义 `IpcResponse<T>` 与 `StreamMessage<T>`，供 main/preload/renderer 三端消费。
- Good: proposal apply 运行状态写入 `data/projects/<encodedPath>/apply-runs/<changeId>/run.json` 与 `stage-*.messages.jsonl`，而不是散落到多个临时目录。
- Good: `ProjectIntegrationConfig` 作为项目维度 integration 挂载配置，由主进程 storage/service 统一读写。
- Bad: 在 renderer 侧本地声明一个与 `src/shared/types/project.ts` 名字相同但字段不一致的 `ProjectInfo`。
- Bad: 未更新 storage 测试就修改 `meta.json`、`connections.json`、`run.json`、`archive.json` 结构。

## Chat Prompt Attachments

- ACP prompt capability 缓存写入 `<userData>/acp/agent-capabilities.json`，schema 为 `{ version: 1, agents: { <agentId>: { promptCapabilities, capturedAgentVersion, capturedAt } } }`。`promptCapabilities` 三个字段必须是归一化后的 boolean。
- Chat prompt 附件写入 `<userData>/projects/<encoded(projectPath)>/sessions/<sessionId>/attachments/<uuid>.<ext>`；目录 owner 是 session，`chat:removeSession` 必须同步递归删除该 session 的 `attachments/` 目录。
- `<sessionId>.messages.jsonl` 中的 user message `parts` 支持 AI SDK `text` 与 `FileUIPart` 混合：`{ type: "file", mediaType, url: "file://...", filename }`。assistant message part 结构不因此扩展。

## ACP 安装状态缓存

- `<userData>/acp/installed.json`（`AcpInstalledMap`）是**安装账本（权威源）**：由安装/卸载流程写入，记录 `managedBy`、`installMethod`、`installPath`、`installedVersion`、`installedAt`。其中 `managedBy`（fyllocode/user）与 `installPath` 是检测无法重建的字段——检测只能看到“包是否存在”，无法判断“谁装的”，FylloCode 装的二进制也可能不在 PATH 上需靠 `installPath` 识别，因此该文件不可被检测结果替代。
- `<userData>/acp/status-cache.json`（`AcpStatusCache`，结构 `{ fetchedAt: string, statuses: AcpAgentStatus[] }`）是**检测输出的只读派生快照**：`statuses` 元素即前端契约 `AcpAgentStatus`，含 `installed:false` 的未安装 Agent，供面板读一个文件直接渲染。它镜像 `acp-registry-cache.ts` 的 `{ fetchedAt, data }` 形态，但**不设 TTL**。
- 数据流单向：安装/卸载 → 写 `installed.json` → 作为检测输入并被检测回填修正 → 检测产出 `AcpAgentStatus[]` → 写 `status-cache.json`。`status-cache.json` 永不被手动编辑，无需与 `installed.json` 双向同步；重叠字段（`managedBy`/`installMethod`/版本）是检测时从账本拷贝而来。
- 新鲜度模型：`acp:detectStatus` 走 stale-while-revalidate——有缓存立即返回并后台检测，完成后经 `acp:statusUpdated` 广播覆盖；`acp:detectStatusForced`（设置页 Refresh、安装/卸载后刷新）绕过缓存前台等真实结果。外部（终端 `npm i -g`）变更会在下次打开 App 后约 1 秒经后台刷新跟上，或手动 Refresh 立即反映。

## Project Lineage

- 项目级 lineage 数据写入 `<userData>/projects/<encoded(projectPath)>/lineage/`。其中 `subjects/<subjectId>.json` 是每条原始需求线索的权威源，`index.json` 是从 subjects 派生的反查索引。
- `SessionMeta.originTaskRef?: LineageTaskRef` 写入 `<userData>/projects/<encoded(projectPath)>/sessions/<sessionId>.json`，字段名使用驼峰 `originTaskRef`。它是 session 出身任务的 write-once 权威指针，唯一写入者为 `chat-service.createSession`；`SessionMetaPatch` 必须排除该字段，创建后不得通过 patch 路径改写或清除。
- `Session.originTaskRef` 从 `SessionMeta.originTaskRef` 映射给 renderer。lineage 的 task→session link 是尽力而为的派生边；当边写入失败时，session 出身事实仍以 `originTaskRef` 为准，任务标题与来源展示仍从 lineage subject 的 `LineageTaskSnapshot` 快照读取。
- `TaskItem.originSessionId?: string` 写入 `<userData>/projects/<encoded(projectPath)>/tasks/tasks.json`，字段名使用驼峰 `originSessionId`。它是本地任务由 chat 会话创建时的 write-once 来源指针，唯一写入者为 `lineage:createSessionTask` 协调流程；`CreateLocalTaskInput`、`UpdateTaskInput` 与 task IPC schema 不包含该字段，普通 `task:create` / `task:update` 不得写入或改写它。读取旧任务文件时历史 `proposalId` 字段必须被忽略，不进入规范化后的 `TaskItem`。
- `Subject.origin` 只能是 `"task"` 或 `"chat"`，创建后不得翻转。chat 起源后续补建本地 task 时仍保持 `origin: "chat"`，消费方可据此判断 task 是否为后补建。
- `Subject.task` 是 `LineageTaskSnapshot | null`。快照保存 `<source>:<taskId>` 形式的 `ref`、全量 `TaskItem` 和 `capturedAt`，用于保留第三方任务在关闭或过滤后仍可回溯的源头信息；chat 起源在补建 task 前允许为 `null`。
- `index.json` 含 `tasks`、`sessions`、`proposals` 三类 `key → subjectId` 反查表，可由 `subjects/*.json` 重建。读取 index 失败或缺失时，service 查询路径应触发重建；因此 index 格式变化无需迁移脚本。
- `subjects/*.json` 是账本类权威数据。后续若 subject schema 发生不兼容变化（字段重命名、类型变更、字段删除、结构调整），必须按本文迁移规则新增迁移脚本。
- MCP proposal 事件写入 `<userData>/projects/<encoded(projectPath)>/mcp-events/`，文件名为 `<timestamp>-<nanoid>.json`，内容类型为 `McpProposalEvent`：`{ server: "fyllo-specs", tool: "create-proposal", createdAt, sessionId, changeId }`。写出方必须先写临时文件再 rename，消费成功后由主进程删除事件文件；损坏事件文件跳过并记录日志，不阻断其他事件。
- `mcp-events` 是 MCP server 到主进程 lineage 写入者之间的单向持久化队列。主进程 consumer 启动时全量扫描残留事件，随后以 `fs.watch` 触发重新全量扫描；消费时先 `recordProposal`，纯 chat 起源缺 subject 时先 `ensureChatSubject` 再重试，lineage 仍保持主进程单一写入。

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm vitest run test/main/infra/storage/**/*.spec.ts`
- `pnpm vitest run test/main/services/**/*.spec.ts`
- `pnpm vitest run test/shared/**/*.{test,spec}.ts`
- 对持久化结构有改动时，手动检查 `data/` 目录约定、开发/生产路径映射和 JSON 序列化格式是否仍与代码一致。

## Maintenance

- 当共享类型目录、存储格式、消息文件布局、错误码来源或默认值语义变化时，必须更新本文档。
- 当新增 capability 引入新的持久化资源、共享实体或跨进程 payload 时，应补充本文档中的 Rules 与 Examples。
- 如果 `src/shared/types/` 的注释、名称或结构与 OpenSpec requirement 冲突，应以 spec 和实际运行契约为准并修复文档。
- 当新增迁移脚本时，须同步更新本文档中相关章节对持久化结构的描述（如"ACP 安装状态缓存"），保持文档与代码一致。
