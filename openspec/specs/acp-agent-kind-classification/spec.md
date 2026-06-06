# acp-agent-kind-classification Specification

## Purpose

TBD - created by archiving change add-acp-agent-kind-classification. Update Purpose after archive.

## Requirements

### Requirement: Agent 分类元数据契约

FylloCode SHALL 在 ACP registry 数据之上叠加一个**自有命名空间字段** `__fyllo`，用于承载本地维护的元数据。每个 `AcpAgentEntry` SHALL 在 FylloCode 数据出口处携带可选字段 `__fyllo: { kind: AcpAgentKind }`，其中 `AcpAgentKind` 取值范围为 `"native" | "adapter" | "bridge"`，定义如下：

- `native`：原生 ACP agent，自带完整实现，无外部命令行工具依赖
- `adapter`：独立适配层，自带完整实现，可与对应原生 CLI 共享配置/环境变量，但运行时**不**调用本地 CLI
- `bridge`：桥接层，运行时通过 spawn 等方式调用本地命令行工具完成工作，依赖该 CLI 已安装

`__fyllo` 字段命名空间 SHALL 保留给 FylloCode 自有元数据；后续若新增 FylloCode 自有维度，应在 `__fyllo` 内追加而非顶层新增字段。

#### Scenario: 类型定义在共享类型中

- **WHEN** 任意主进程或渲染进程模块导入 `@shared/types/acp-agent` 中的 `AcpAgentEntry`
- **THEN** 该类型 SHALL 包含可选字段 `__fyllo?: { kind: "native" | "adapter" | "bridge" }`

#### Scenario: 命名空间预留扩展

- **WHEN** 未来需要在每个 agent 上附带新的 FylloCode 自有元数据
- **THEN** 该字段 SHALL 添加在 `__fyllo` 命名空间下
- **AND** 不得在 `AcpAgentEntry` 顶层直接新增 FylloCode 自有字段

### Requirement: AgentKindMap 内置映射与兜底

FylloCode SHALL 在主进程源码中维护一份 `AgentKindMap`，按 `agent.id` 显式记录 `adapter` 与 `bridge` 类 agent 的清单。映射当前定义为：

- `adapter`: `claude-acp`、`codex-acp`、`amp-acp`
- `bridge`: `pi-acp`

未在 `AgentKindMap` 中显式列出的 `agent.id` SHALL 被视为 `native`。

`adapter` 与 `bridge` 类的判定准则 SHALL 与 `guidelines/Domain.md` 中的定义保持一致：

- **adapter**：存在用户视角下的对应官方 Agent / CLI（足以让用户产生「我装了它，FylloCode 是不是该识别」预期），且该 ACP 包自带完整实现、不 spawn 该 CLI 子进程。没有这种心智锚点的纯 HTTP 实现归为 `native`。
- **bridge**：运行时通过 spawn 等方式调用本地命令行工具完成工作，依赖该 CLI 已安装。

#### Scenario: 已知 adapter 的 id 被解析为 adapter

- **WHEN** 调用 `resolveAgentKind("claude-acp")`、`resolveAgentKind("codex-acp")` 或 `resolveAgentKind("amp-acp")`
- **THEN** 返回 `"adapter"`

#### Scenario: 已知 bridge 的 id 被解析为 bridge

- **WHEN** 调用 `resolveAgentKind("pi-acp")`
- **THEN** 返回 `"bridge"`

#### Scenario: 未匹配 id 兜底为 native

- **WHEN** 调用 `resolveAgentKind` 时传入未在映射中列出的 `agent.id`
- **THEN** 返回 `"native"`

#### Scenario: 无心智锚点的纯 HTTP 实现归为 native

- **WHEN** 评估某 ACP 包：自带完整实现、纯 HTTP 调远端 API，但不存在用户视角下的对应官方 CLI 产品（例如 `glm-acp-agent`、`agoragentic-acp`）
- **THEN** 该 agent SHALL **不**进入 `ADAPTER_AGENT_IDS`
- **AND** SHALL 通过兜底解析为 `"native"`

### Requirement: 唯一出口注入分类

FylloCode SHALL 在 `src/main/infra/storage/acp-registry-cache.ts` 暴露的 registry 数据出口（`getRegistry()` 与 `refreshRegistry()`）返回前，对 `data.agents` 中每个条目按 `AgentKindMap` 注入 `__fyllo.kind`。所有内部消费方（detector、IPC channel、其他 main 进程模块）以及通过 IPC 流向渲染进程的数据 SHALL 来自同一出口，不得自行重复合并分类。

#### Scenario: getRegistry 返回的数据已带分类

- **WHEN** 主进程任意模块调用 `getRegistry()`
- **THEN** 返回的 `AcpRegistry.agents` 中每个 entry 的 `__fyllo.kind` SHALL 与 `resolveAgentKind(entry.id)` 一致

#### Scenario: refreshRegistry 返回的数据已带分类

- **WHEN** 主进程调用 `refreshRegistry()` 强制刷新
- **THEN** 返回的 `AcpRegistry.agents` 中每个 entry 的 `__fyllo.kind` SHALL 与 `resolveAgentKind(entry.id)` 一致

#### Scenario: 分类不写入磁盘缓存

- **WHEN** 主进程刷新 registry 并写入 `registry-cache.json`
- **THEN** 文件中的 `data.agents` 条目 SHALL **不**包含 `__fyllo` 字段
- **AND** 注入仅发生在 `getRegistry()`/`refreshRegistry()` 的返回路径上

### Requirement: 产品词汇与判定标准的同步纪律

FylloCode 仓库 SHALL 在 `guidelines/Domain.md` 中维护 `native` / `adapter` / `bridge` 三类 agent 的定义、判定准则、当前已知归类与同步纪律。新增或重新分类 ACP agent 时，维护者 SHALL 双向同步 `guidelines/Domain.md` 与 `src/main/domain/acp/agent-kind-map.ts`。

#### Scenario: Domain.md 包含三类定义与判定准则

- **WHEN** 维护者查阅 `guidelines/Domain.md`
- **THEN** 文档 SHALL 包含 `native` / `adapter` / `bridge` 三类的定义
- **AND** SHALL 包含「用户心智锚点」判定准则（adapter 必须存在对应官方 Agent / CLI 锚点）
- **AND** SHALL 列出当前已知归类（含 native 边界示例）
- **AND** SHALL 明确「新增或重新分类必须双向同步 `guidelines/Domain.md` 与 `agent-kind-map.ts`」

#### Scenario: agent-kind-map.ts 顶部注释指向 Domain.md

- **WHEN** 维护者打开 `src/main/domain/acp/agent-kind-map.ts`
- **THEN** 文件顶部注释 SHALL 指向 `guidelines/Domain.md` 作为判定准则的 source of truth

### Requirement: 卡片 UI 通过分类图标 + tooltip 表达差异

FylloCode SHALL 在设置页 `AgentCard` 与 Chat 空态 `AgentPickerCard` 两处卡片入口使用统一的分类徽章组件渲染 `__fyllo.kind`，规则如下：

- `native`：不渲染任何分类图标
- `adapter`：渲染 `i-lucide-layers` 图标，hover 显示文案「适配器 · 自带完整实现，可与已安装的对应 Agent 共享配置」
- `bridge`：渲染 `i-lucide-cable` 图标，hover 显示文案「桥接器 · 与 Agent 桥接打通，需要先安装对应的 Agent」

文案 SHALL 保持通用化，不出现具体 agent 名或具体 CLI 名（如 claude / codex / pi）。

`InstalledAgentTile`（Chat 空态首屏的极简切换 tile）SHALL **不**渲染分类徽章 —— 该入口承担 agent 切换而非引导/教育职责，且其右上角已被「选中态对勾角标」占用。Chat 空态的分类引导由用户进入 `AgentPickerModal` 时由 `AgentPickerCard` 承担。

#### Scenario: native 卡片不显示分类图标

- **WHEN** 渲染 `__fyllo.kind === "native"` 或缺失 `__fyllo` 的 agent 卡片
- **THEN** 卡片上 SHALL **不**渲染分类图标

#### Scenario: adapter 卡片显示 layers 图标与文案

- **WHEN** 渲染 `__fyllo.kind === "adapter"` 的 agent 卡片
- **THEN** 卡片上 SHALL 显示 `i-lucide-layers` 图标
- **AND** hover 时 SHALL 显示文案「适配器 · 自带完整实现，可与已安装的对应 Agent 共享配置」

#### Scenario: bridge 卡片显示 cable 图标与文案

- **WHEN** 渲染 `__fyllo.kind === "bridge"` 的 agent 卡片
- **THEN** 卡片上 SHALL 显示 `i-lucide-cable` 图标
- **AND** hover 时 SHALL 显示文案「桥接器 · 与 Agent 桥接打通，需要先安装对应的 Agent」

#### Scenario: 两处卡片入口使用同一徽章组件

- **WHEN** 设置页 `AgentCard`、Chat 空态 `AgentPickerCard` 两处需要表达分类
- **THEN** SHALL 使用同一个共用徽章组件（如 `AgentKindBadge.vue`），以保证图标与文案一致

#### Scenario: InstalledAgentTile 不渲染分类徽章

- **WHEN** Chat 空态首屏渲染 `InstalledAgentTile`
- **THEN** 该 tile SHALL **不**渲染任何分类图标或徽章
- **AND** SHALL **不**接受 `kind` prop
