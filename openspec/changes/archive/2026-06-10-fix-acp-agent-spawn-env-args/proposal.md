## Why

ACP registry 的 distribution 可以为 agent 声明运行时启动参数和环境变量，但当前 `acp-process-pool.ts` 启动 agent 时只处理了 `npx` / `uvx` 的 `args`，没有加载任何 distribution `env`，并且 `binary` distribution 的共享类型也缺少 `args` / `env`。这会导致依赖启动参数或环境变量的 ACP agent 无法正常启动。

## What Changes

- 新增 ACP agent runtime spawn 契约，明确 `npx`、`uvx`、`binary` 三种安装方式启动时如何从 registry distribution 读取 `args` 与 `env`。
- 扩展 `AcpAgentBinaryDistribution`，让 binary 平台 entry 支持 `args?: string[]` 与 `env?: Record<string, string>`。
- 调整 `src/main/infra/process/acp-process-pool.ts`：
  - `npx` 启动继续使用 `["--no-install", <bare package>, ...args]`，并合并 `distribution.npx.env`。
  - `uvx` 启动继续使用 `[package, ...args]`，并合并 `distribution.uvx.env`。
  - `binary` 启动继续使用 `installed.json` 中的 `installPath` 作为命令，同时读取当前平台 binary entry 的 `args` / `env`。
- 补充主进程单元测试，覆盖三种安装方式的 runtime `args` / `env` 组装。

## Capabilities

### New Capabilities

- `acp-agent-runtime-spawn`: 定义主进程启动 ACP agent 子进程时如何从 registry distribution 和 installed record 组装命令、参数与环境变量。

### Modified Capabilities

无。

## Impact

- 共享类型：`src/shared/types/acp-agent.ts`
- 主进程基础设施：`src/main/infra/process/acp-process-pool.ts`
- 测试：`test/main/infra/process/acp-process-pool.spec.ts`
- 不引入新的持久化文件格式，不需要迁移 `installed.json`、`registry-cache.json` 或 `status-cache.json`。
