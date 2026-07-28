## ADDED Requirements

### Requirement: Main 持久化完整的已选 ACP 初始化能力

系统 SHALL 在 Agent 成功完成 ACP `initialize` 后，按 Agent ID 将响应中的 `authMethods`、`agentCapabilities.promptCapabilities`、`agentCapabilities.mcpCapabilities` 与 `agentCapabilities.sessionCapabilities` 连同 captured Agent version 和 captured time 写入版本化 capability cache。系统 SHALL 直接采用当前 ACP SDK 对应类型的序列化形状，并 SHALL 保留这些对象及其嵌套对象中的 `_meta` 和未知扩展字段。

#### Scenario: Agent 返回四类初始化数据

- **WHEN** Agent 的 initialize response 同时包含 `authMethods`、prompt、MCP 与 session capabilities
- **THEN** main SHALL 在同一 Agent cache entry 中保存四类原始 SDK 数据
- **AND** cache entry SHALL 保存 Agent version 与采集时间
- **AND** main SHALL NOT 将 session marker object 转换为自定义布尔结构

#### Scenario: Agent 只声明部分能力

- **WHEN** initialize response 缺少四类数据中的一个或多个 optional 字段
- **THEN** cache SHALL 保持对应字段缺失
- **AND** cache SHALL NOT 以空数组、空对象或 false 伪造 Agent 未声明的能力

#### Scenario: Agent 返回扩展元数据

- **WHEN** auth method、prompt、MCP、session capability 或其嵌套对象包含 `_meta` 或 SDK 类型尚未声明的扩展字段
- **THEN** cache 写入与后续读取 SHALL 保留这些字段和值
- **AND** runtime validation SHALL NOT strip 这些扩展字段

### Requirement: Capability cache 兼容旧格式并保持可重建

系统 SHALL 读取现有 version 1 prompt-only cache，并将其作为缺少新增字段的 capability snapshot 提供给调用方。缓存缺失、损坏、版本未知或写入失败 SHALL NOT 阻止 Agent initialize、main bootstrap 或 renderer 当前 prompt 能力流程。

#### Scenario: 读取 version 1 cache

- **WHEN** 磁盘存在合法的 version 1 prompt-only cache
- **THEN** main SHALL 保留每个 entry 的 prompt capabilities、captured Agent version 与 captured time
- **AND** main SHALL 将未缓存的 auth、MCP 与 session 字段保持为缺失
- **AND** 本次读取 SHALL NOT 改写磁盘 cache 或执行独立数据迁移
- **AND** 后续 successful initialize SHALL 用完整 version 2 snapshot 刷新对应 Agent

#### Scenario: 首个 Agent 连接后写出 version 2

- **WHEN** 应用已经读取 version 1 cache，且任一 Agent 随后成功完成 initialize
- **THEN** main SHALL 将该 Agent entry 替换为完整 capability snapshot
- **AND** main SHALL 以 version 2 envelope 写回 cache
- **AND** 尚未重新连接的其他 Agent SHALL 可继续保留只含旧 prompt 数据的 partial snapshot
- **AND** renderer 下一次读取 cache SHALL 获得 version 2 文档对应的 snapshot map

#### Scenario: cache 文件损坏或版本未知

- **WHEN** cache JSON 无法解析、schema 不合法或 version 不受支持
- **THEN** main SHALL 记录诊断日志并把 cache 视为空
- **AND** Agent 连接和 renderer bootstrap SHALL 继续运行

#### Scenario: 持久化完整能力失败

- **WHEN** Agent initialize 已成功但 capability cache 写入失败
- **THEN** process pool SHALL 继续把 Agent 标记为 ready
- **AND** `ensureAgent` SHALL 能从 live initialize response 返回完整能力 snapshot

### Requirement: 并发 Agent 更新不丢失 cache entry

系统 SHALL 在 main 进程内串行化 capability cache 的 upsert 和 remove read-modify-write 操作，使并发完成 initialize 或配置 mutation 的不同 Agent 不会相互覆盖已缓存 entry。

#### Scenario: 多个 Agent 并发完成 initialize

- **WHEN** 两个或以上 Agent 近同时提交 capability snapshot
- **THEN** 最终 cache SHALL 包含每个成功提交的 Agent entry
- **AND** 每个 entry SHALL 对应各自最后一次成功提交的完整 snapshot

#### Scenario: 单次 mutation 失败

- **WHEN** 一个串行 cache mutation 抛出错误
- **THEN** 后续 mutation SHALL 仍可执行
- **AND** mutation 队列 SHALL NOT 永久停滞

### Requirement: Main IPC 向 renderer 返回未裁剪的 capability snapshot

系统 SHALL 通过现有 `platform:acp-agents:loadCapabilitiesCache` channel 返回按 Agent ID 索引的完整 capability snapshot，并 SHALL 让 `ensureAgent` 返回目标 Agent 的同形 snapshot。main IPC SHALL NOT 将响应裁剪为 prompt-only map。

#### Scenario: Renderer 加载 capability cache

- **WHEN** renderer 调用 `loadCapabilitiesCache`
- **THEN** 响应中的每个 Agent entry SHALL 包含 cache 中现有的 auth methods、prompt、MCP、session、version 与采集时间字段
- **AND** IPC、preload 与 renderer wrapper 类型 SHALL 使用 shared 完整 snapshot contract
- **AND** `_meta` 与未知扩展字段 SHALL 在跨进程传输后保持不变

#### Scenario: ensureAgent 命中匹配版本 cache

- **WHEN** `ensureAgent` 找到 captured version 与当前安装版本匹配的完整或 v1 提升 snapshot
- **THEN** main SHALL 立即返回该 snapshot
- **AND** main SHALL 保持现有 lazy process start 行为

#### Scenario: ensureAgent 需要 initialize

- **WHEN** cache 缺失或 captured version 与当前 Agent 版本不匹配
- **THEN** main SHALL 复用或启动 Agent process 完成 initialize
- **AND** main SHALL 从 live initialize response 返回完整 snapshot

### Requirement: Renderer 接收完整能力且保持现有 prompt 行为

renderer SHALL 保存 `loadCapabilitiesCache` 与 `ensureAgent` 返回的完整 per-Agent snapshot，并 SHALL 通过 store public surface 使后续 Agent 个性化适配可以访问 auth methods、prompt、MCP 与 session 数据。当前 prompt capability selector、默认 false 语义、附件能力判断和 Agent unavailable 清理行为 SHALL 保持不变。

#### Scenario: Bootstrap 加载完整 snapshot

- **WHEN** renderer bootstrap 成功加载 capability cache
- **THEN** ACP Agent store SHALL 按 Agent ID 保存完整 snapshot
- **AND** 后续 store consumer SHALL 能读取对应 Agent 的 auth methods、MCP 与 session capabilities

#### Scenario: 当前 prompt UI 读取能力

- **WHEN** 当前组件通过既有 `getPromptCapabilities` 读取一个已有、缺失或 v1 提升的 Agent snapshot
- **THEN** selector SHALL 继续返回 `image`、`audio` 与 `embeddedContext` 三个必填布尔值
- **AND** 未声明的 prompt 字段 SHALL 继续归一化为 false
- **AND** 当前组件 SHALL NOT 需要修改其调用方式

#### Scenario: Agent 变为 unavailable

- **WHEN** renderer 收到目标 Agent 的 unavailable event
- **THEN** store SHALL 删除该 Agent 的完整 snapshot
- **AND** 既有 session probe 清理与 prompt fallback 行为 SHALL 保持不变
