---
name: DataModel
description: 跨进程共享类型、持久化结构、序列化规则与兼容性约束
keywords: [data-model, shared-types, persistence, serialization]
---

# DataModel

## Purpose

定义 FylloCode 的共享类型、核心实体、持久化元数据结构、消息文件格式以及数据契约演进时必须遵守的兼容性规则。任何涉及 `shared/types/`、项目数据目录、JSON/JSONL 结构、跨进程 payload 或默认值语义的工作，都必须先阅读本文档。

## Applicability

- 适用于 `shared/types/**`、`shared/constants/**`、`shared/schemas/**`。
- 适用于 `electron/main/infra/storage/**`、`electron/main/services/**` 中读写持久化结构的代码。
- 适用于 `data/` 对应的开发数据布局与生产 `userData` 映射。
- 不覆盖 channel 语义与 bridge 公开接口；见 `guidelines/IPC.md`。

## Sources of Truth

- `shared/types/**`
- `shared/constants/error-codes.ts`
- `shared/schemas/ipc/**`
- `electron/main/infra/storage/**`
- `electron/main/infra/storage/project-paths.ts`
- `electron/main/infra/paths/index.ts`
- `electron/main/services/**`
- `electron/main/__tests__/infra/storage/**`
- `openspec/specs/project-store-persistence/spec.md`
- `openspec/specs/session-meta-storage/spec.md`
- `openspec/specs/proposal-apply-run/spec.md`
- `openspec/specs/integration-providers/spec.md`
- `openspec/specs/global-preferences/spec.md`

## Rules

- MUST: 将跨进程共享的实体、请求/响应类型和核心值对象定义在 `shared/types/`，避免前后端各自声明不兼容的同名结构。
- MUST: 将 IPC 入参的运行时校验 schema 与共享类型分开管理；类型放在 `shared/types/`，校验放在 `shared/schemas/ipc/`。
- MUST: 将项目作用域数据目录通过 `project-paths.ts` 统一寻址，保持 `projects/<encodedPath>/...` 结构稳定。
- MUST: 让持久化文件格式与运行时类型同步演进；当 JSON、JSONL、meta 文件结构变化时，必须同步更新读写实现、测试和相关 guideline。
- MUST: 保持共享响应结构 `IpcResponse<T>`、流式消息结构 `StreamMessage<T>`、错误信息结构 `IpcErrorInfo` 的统一来源，避免局部重定义。
- MUST: 将新错误码加入 `shared/constants/error-codes.ts`，并把依赖这些错误码的 IPC 返回值保持为共享联合类型。
- MUST: 在默认值、可选字段、时间戳格式、枚举值含义发生变化时，先判断这是否是行为契约变化；若是，先更新 OpenSpec。
- SHOULD: 使用字符串时间戳或文件友好格式持久化运行状态，而不是把 `Date` 实例直接隐式写入 JSON。
- SHOULD: 为每种关键持久化结构保留对应的 storage/service 测试，证明序列化与反序列化行为。
- MAY: 在仅限前端展示的局部视图模型中派生附加字段，但不要把这些派生字段反向写进共享持久化结构。

## Examples

- Good: `shared/types/ipc.ts` 统一定义 `IpcResponse<T>` 与 `StreamMessage<T>`，供 main/preload/renderer 三端消费。
- Good: proposal apply 运行状态写入 `data/projects/<encodedPath>/apply-runs/<changeId>/run.json` 与 `stage-*.messages.jsonl`，而不是散落到多个临时目录。
- Good: `ProjectIntegrationConfig` 作为项目维度 integration 挂载配置，由主进程 storage/service 统一读写。
- Bad: 在 renderer 侧本地声明一个与 `shared/types/project.ts` 名字相同但字段不一致的 `ProjectInfo`。
- Bad: 未更新 storage 测试就修改 `meta.json`、`connections.json`、`run.json`、`archive.json` 结构。

## Chat Prompt Attachments

- ACP prompt capability 缓存写入 `<userData>/acp/agent-capabilities.json`，schema 为 `{ version: 1, agents: { <agentId>: { promptCapabilities, capturedAgentVersion, capturedAt } } }`。`promptCapabilities` 三个字段必须是归一化后的 boolean。
- Chat prompt 附件写入 `<userData>/projects/<encoded(projectPath)>/sessions/<sessionId>/attachments/<uuid>.<ext>`；目录 owner 是 session，`chat:removeSession` 必须同步递归删除该 session 的 `attachments/` 目录。
- `<sessionId>.messages.jsonl` 中的 user message `parts` 支持 AI SDK `text` 与 `FileUIPart` 混合：`{ type: "file", mediaType, url: "file://...", filename }`。assistant message part 结构不因此扩展。

## ACP 安装状态缓存

- `<userData>/acp/installed.json`（`AcpInstalledMap`）是**安装账本（权威源）**：由安装/卸载流程写入，记录 `managedBy`、`installMethod`、`installPath`、`installedVersion`、`installedAt`。其中 `managedBy`（fyllocode/user）与 `installPath` 是检测无法重建的字段——检测只能看到“包是否存在”，无法判断“谁装的”，FylloCode 装的二进制也可能不在 PATH 上需靠 `installPath` 识别，因此该文件不可被检测结果替代。
- `<userData>/acp/status-cache.json`（`AcpStatusCache`，结构 `{ fetchedAt: number, statuses: AcpAgentStatus[] }`）是**检测输出的只读派生快照**：`statuses` 元素即前端契约 `AcpAgentStatus`，含 `installed:false` 的未安装 Agent，供面板读一个文件直接渲染。它镜像 `acp-registry-cache.ts` 的 `{ fetchedAt, data }` 形态，但**不设 TTL**。
- 数据流单向：安装/卸载 → 写 `installed.json` → 作为检测输入并被检测回填修正 → 检测产出 `AcpAgentStatus[]` → 写 `status-cache.json`。`status-cache.json` 永不被手动编辑，无需与 `installed.json` 双向同步；重叠字段（`managedBy`/`installMethod`/版本）是检测时从账本拷贝而来。
- 新鲜度模型：`acp:detectStatus` 走 stale-while-revalidate——有缓存立即返回并后台检测，完成后经 `acp:statusUpdated` 广播覆盖；`acp:detectStatusForced`（设置页 Refresh、安装/卸载后刷新）绕过缓存前台等真实结果。外部（终端 `npm i -g`）变更会在下次打开 App 后约 1 秒经后台刷新跟上，或手动 Refresh 立即反映。

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm vitest run electron/main/__tests__/infra/storage/**/*.spec.ts`
- `pnpm vitest run electron/main/__tests__/services/**/*.spec.ts`
- `pnpm vitest run shared/__tests__/**/*.{test,spec}.ts`
- 对持久化结构有改动时，手动检查 `data/` 目录约定、开发/生产路径映射和 JSON 序列化格式是否仍与代码一致。

## Maintenance

- 当共享类型目录、存储格式、消息文件布局、错误码来源或默认值语义变化时，必须更新本文档。
- 当新增 capability 引入新的持久化资源、共享实体或跨进程 payload 时，应补充本文档中的 Rules 与 Examples。
- 如果 `shared/types/` 的注释、名称或结构与 OpenSpec requirement 冲突，应以 spec 和实际运行契约为准并修复文档。
