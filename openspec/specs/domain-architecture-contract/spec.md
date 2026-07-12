# domain-architecture-contract Specification

## Purpose

记录 FylloCode domain-first 架构的跨层行为契约，用于约束 preload API 形状、IPC channel 命名、shared contract 分组、main service 跨领域入口、renderer store 边界、lint guard，以及重构期间必须保持的业务语义和本地持久化兼容性。

## Requirements

### Requirement: Public preload API is domain-first

系统 SHALL 只在 `window.api` root 暴露 domain namespace，并通过 `window.api.<domain>.<area>.<action>()` 提供 renderer 可调用的 preload API。

#### Scenario: Renderer reads domain namespaces

- **WHEN** renderer 读取 `window.api`
- **THEN** `window.api` SHALL 暴露 `platform`、`workspace`、`session`、`proposal`、`insight` 和 `automation` root namespace
- **AND** `window.api` SHALL NOT 暴露 `chat`、`task`、`workflow`、`proposal` 以外的旧 flat capability root 作为兼容入口

#### Scenario: Release checking uses the platform release area

- **WHEN** renderer 需要检查最新 release version
- **THEN** 系统 SHALL 通过 `window.api.platform.release.checkLatestRelease(...)` 暴露该能力
- **AND** 系统 SHALL NOT 通过 `window.api.platform.settings.checkLatestRelease(...)` 暴露重复 release API

### Requirement: IPC channels include domain and area

系统 SHALL 使用 `<domain>:<area>:<action>` 格式命名 request/response channel、event channel、stream port channel 和 cancel channel。

#### Scenario: Chat channels are under session chat

- **WHEN** 系统定义 chat session、chat stream 或 chat probe 相关 IPC channel
- **THEN** 对应 channel SHALL 使用 `session:chat:*` 前缀
- **AND** 系统 SHALL NOT 将 active chat IPC contract 定义为 `chat:*`

#### Scenario: Proposal run channels are split by public area

- **WHEN** 系统定义 proposal apply 或 archive 相关 IPC channel
- **THEN** apply channel SHALL 使用 `proposal:apply:*` 前缀
- **AND** archive channel SHALL 使用 `proposal:archive:*` 前缀
- **AND** proposal browser/list/status channel SHALL 使用 `proposal:browser:*` 前缀

#### Scenario: Platform and insight channels use owner domains

- **WHEN** 系统定义 settings、release、overview、specs、guidelines、lineage 或 knowledge 相关 IPC channel
- **THEN** settings/release channel SHALL 使用 `platform:<area>:*`
- **AND** overview/specs/guidelines/lineage/knowledge channel SHALL 使用 `insight:<area>:*`

#### Scenario: Knowledge review document channels are under insight knowledge

- **WHEN** 系统定义 knowledge review 文档读取、文档保存、browser state 或 maintenance 相关 IPC channel
- **THEN** 对应 channel SHALL 使用 `insight:knowledge:*` 前缀
- **AND** preload SHALL 通过 `window.api.insight.knowledge.<action>()` 暴露 renderer 可调用 API
- **AND** renderer wrapper SHALL 位于 `src/renderer/src/api/insight/knowledge.ts`
- **AND** 系统 SHALL NOT 将 knowledge review 文档读写 channel 放入 `insight:lineage:*`

### Requirement: Shared and transport contracts are domain grouped

系统 SHALL 按 domain/area 组织 shared IPC contracts、preload API 文件和 renderer API wrappers。

#### Scenario: Shared IPC contract files are domain local

- **WHEN** 新的 IPC channel 或 schema 被定义
- **THEN** channel/schema SHALL 位于 `src/shared/ipc/<domain>/<area>.*`
- **AND** `src/shared/types/channels.ts` SHALL NOT 作为新增 active channel 的主要编辑位置

#### Scenario: Renderer wrappers mirror preload contract

- **WHEN** renderer API wrapper 调用 preload API
- **THEN** wrapper SHALL 位于 `src/renderer/src/api/<domain>/<area>.ts`
- **AND** wrapper SHALL 调用 `window.api.<domain>.<area>`
- **AND** renderer wrapper SHALL NOT 调用 `window.api.<area>`

### Requirement: Main service cross-domain imports use domain public surface

系统 SHALL 只允许 main service 跨领域 import 目标领域根级 `_public` 出口。

#### Scenario: Cross-domain service import targets root public surface

- **WHEN** `src/main/services/<source-domain>/**` 需要调用另一个 service domain 的能力
- **THEN** import path SHALL 指向 `@main/services/<target-domain>/_public`
- **AND** import path SHALL NOT 指向 `@main/services/<target-domain>/<area>/**`

#### Scenario: Domain public surface is explicit

- **WHEN** `src/main/services/<domain>/_public/**` 暴露跨领域可复用能力
- **THEN** 该 `_public` module SHALL 显式 export 稳定方法
- **AND** 该 `_public` module SHALL NOT 使用 `export *`
- **AND** 该 `_public` module SHALL NOT import 其他 product domain 的 service

#### Scenario: Area-level public surface is forbidden

- **WHEN** main service 目录被 lint 检查
- **THEN** 系统 SHALL reject `src/main/services/<domain>/<area>/_public/**`

### Requirement: Renderer store boundaries follow domain ownership

系统 SHALL 按 domain 组织 renderer stores，并按 UI state、页面 workflow 和复用边界决定 domain 内 store 形状。

#### Scenario: Stores are not service-tree mirrors

- **WHEN** main service tree 中存在某个 area 或 helper
- **THEN** renderer SHALL NOT 因该 service/helper 存在而必须创建同名 store
- **AND** renderer store SHALL 仅在拥有可复用 UI state 或 workflow state 时创建

#### Scenario: Pages do not compose unrelated stores directly

- **WHEN** 页面或组件需要跨领域行为
- **THEN** 该行为 SHALL 通过所属领域 store 的 action、目标领域 public store 或明确 facade 组合
- **AND** 页面或组件 SHALL NOT 直接 import 无关 product domain 的 store

#### Scenario: Stores do not bypass domain ownership through API wrappers

- **WHEN** domain store 需要另一个 domain 的数据或动作
- **THEN** store SHALL 通过目标 domain 的 public store/facade/action 协作
- **AND** store SHALL NOT 直接 import 另一个 domain 的 renderer API wrapper

### Requirement: Domain refactor preserves business behavior and persisted data

系统 SHALL 将本次重构限制为结构和跨进程契约迁移，并保持业务语义与本地持久化格式不变。

#### Scenario: Storage paths remain compatible

- **WHEN** storage-backed service 被移动到新的 domain 目录
- **THEN** 该 service 读写的 storage path、JSON key 和 JSON schema SHALL 与迁移前保持兼容
- **AND** 若无法保持兼容，系统 SHALL NOT 在本变更中继续实现该 storage 变更，除非先补充显式 migration proposal

#### Scenario: Business workflow semantics remain unchanged

- **WHEN** proposal apply/archive、task、session、lineage、workflow、integration 或 ACP agent 相关文件被移动
- **THEN** 系统 SHALL 保持迁移前的业务结果、错误语义和用户可见页面状态
- **AND** 系统 SHALL NOT 借本次重构改变业务算法或用户流程

### Requirement: Domain boundary rules are lint-enforced

系统 SHALL 通过 lint 或等效静态检查阻止违反 domain boundary 的 import 和 export。

#### Scenario: Invalid service imports fail lint

- **WHEN** main service 从另一个 service domain import 非 `_public` 路径
- **THEN** lint SHALL fail

#### Scenario: Invalid renderer imports fail lint

- **WHEN** renderer 非 wrapper 代码直接调用 `window.api`、domain store import 其他 domain API wrapper、或页面 import 无关 product domain store
- **THEN** lint SHALL fail
