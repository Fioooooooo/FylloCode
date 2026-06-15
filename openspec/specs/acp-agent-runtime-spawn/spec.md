# acp-agent-runtime-spawn 规范

## Purpose

定义 ACP agent distribution 中 `args` / `env` 运行时元数据的共享类型与启动注入规则，确保 npx、uvx、binary 三类分发在保持兼容的同时正确传递参数和环境变量。

## Requirements

### Requirement: ACP agent distribution 运行时元数据

系统 SHALL 在共享类型 `src/shared/types/acp-agent.ts` 中表达 ACP agent runtime 启动所需的参数和环境变量。`AcpAgentNpxDistribution`、`AcpAgentUvxDistribution` 与 `AcpAgentBinaryDistribution` 均 SHALL 支持可选字段 `args?: string[]` 与 `env?: Record<string, string>`。对于 binary distribution，`args` 与 `env` SHALL 位于当前平台对应的 binary entry 上。

#### Scenario: binary distribution 声明运行时 args/env

- **WHEN** registry 中某 agent 的 `distribution.binary[<platform>]` 包含 `args` 与 `env`
- **THEN** FylloCode 的共享类型 SHALL 能表达该 entry 的 `args?: string[]` 与 `env?: Record<string, string>`
- **AND** 不要求把这些字段写入 `AcpInstalledRecord`

#### Scenario: 旧 registry cache 缺少可选字段

- **WHEN** 本地 `registry-cache.json` 中的 binary entry 仅包含 `archive` 与 `cmd`
- **THEN** 系统 SHALL 继续正常读取该 registry cache
- **AND** 缺失的 `args` SHALL 按空数组处理，缺失的 `env` SHALL 按 `process.env` 处理

### Requirement: ACP agent 运行时启动加载 distribution args/env

主进程 SHALL 在 `src/main/infra/process/acp-process-pool.ts` 启动 ACP agent 子进程时，从 registry distribution 和 installed record 组装 runtime spawn spec。distribution `env` 存在时，spawn options 的 `env` SHALL 为 `{ ...process.env, ...distribution.env }`；distribution `env` 不存在时 SHALL 保持 `process.env`。distribution env 的同名 key SHALL 覆盖父进程环境。

#### Scenario: npx agent 加载 args 与 env

- **WHEN** `AcpInstalledRecord.installMethod === "npx"`，且 registry entry 包含 `distribution.npx.package`、`distribution.npx.args` 与 `distribution.npx.env`
- **THEN** 主进程 SHALL 使用 `cross-spawn` 启动命令 `npx`
- **AND** args SHALL 为 `["--no-install", <bare package>, ...distribution.npx.args]`
- **AND** spawn options 的 `env` SHALL 合并 `process.env` 与 `distribution.npx.env`

#### Scenario: uvx agent 加载 args 与 env

- **WHEN** `AcpInstalledRecord.installMethod === "uvx"`，且 registry entry 包含 `distribution.uvx.package`、`distribution.uvx.args` 与 `distribution.uvx.env`
- **THEN** 主进程 SHALL 使用 `cross-spawn` 启动命令 `uvx`
- **AND** args SHALL 为 `[distribution.uvx.package, ...distribution.uvx.args]`
- **AND** spawn options 的 `env` SHALL 合并 `process.env` 与 `distribution.uvx.env`

#### Scenario: binary agent 加载平台 args 与 env

- **WHEN** `AcpInstalledRecord.installMethod === "binary"`，`AcpInstalledRecord.installPath` 存在，且当前平台匹配的 `distribution.binary` entry 包含 `args` 与 `env`
- **THEN** 主进程 SHALL 使用 `installPath` 作为 `cross-spawn` 命令
- **AND** args SHALL 为当前平台 binary entry 的 `args`
- **AND** spawn options 的 `env` SHALL 合并 `process.env` 与当前平台 binary entry 的 `env`

#### Scenario: binary agent 缺少平台运行时元数据时保持兼容

- **WHEN** `AcpInstalledRecord.installMethod === "binary"`，`AcpInstalledRecord.installPath` 存在，但当前平台没有匹配的 `distribution.binary` entry 或该 entry 未声明 `args` / `env`
- **THEN** 主进程 SHALL 继续使用 `installPath` 作为 `cross-spawn` 命令
- **AND** args SHALL 为空数组
- **AND** spawn options 的 `env` SHALL 保持 `process.env`

#### Scenario: env 不写入日志

- **WHEN** 主进程记录 ACP agent spawn 日志
- **THEN** 日志 SHALL NOT 输出 distribution `env` 的 key 或 value
- **AND** 日志 SHALL 继续包含 agentId、命令与参数，以支持启动诊断
