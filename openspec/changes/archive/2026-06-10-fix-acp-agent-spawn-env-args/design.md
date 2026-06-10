## Context

`src/main/infra/process/acp-process-pool.ts` 是 ACP agent runtime 子进程的启动点。当前 `buildSpawnArgs()` 只返回 `{ cmd, args }`：`npx` / `uvx` 会拼接 registry 中的 `args`，但 `spawn()` 的 `env` 固定为 `process.env`；`binary` 分支则固定返回 `args: []`。同时 `src/shared/types/acp-agent.ts` 中 `AcpAgentNpxDistribution` 和 `AcpAgentUvxDistribution` 已有 `args` / `env` 字段，`AcpAgentBinaryDistribution` 只有 `archive` / `cmd`。

安装/卸载流程已有可复用的环境变量合并模式：`installer.ts#runStreamingCommand()` 在 distribution env 存在时使用 `{ ...process.env, ...env }`，否则使用 `process.env`。runtime spawn 应采用同样的合并语义，避免 agent 因缺少 registry 声明的环境变量而启动失败。

## Goals / Non-Goals

**Goals:**

- 让 `AcpAgentBinaryDistribution` 能表达当前平台 binary agent 启动所需的 `args` 和 `env`。
- 让 `acp-process-pool.ts` 对 `npx`、`uvx`、`binary` 三种 install method 都加载 registry distribution 的 runtime `env`。
- 让 binary agent runtime spawn 使用当前平台 binary entry 的 `args`，同时继续以 `installed.json` 的 `installPath` 作为实际命令路径。
- 用主进程单元测试锁定 `cmd`、`args`、`env` 的组装结果。

**Non-Goals:**

- 不改变 agent 安装/卸载命令的 env 语义；它们已经通过 `installer.ts#runStreamingCommand()` 合并 distribution env。
- 不修改 `AcpInstalledRecord`，也不把 distribution env 写入 `installed.json`。
- 不做 env 变量插值、secret 管理、平台条件表达式或 UI 配置入口。
- 不改变 ACP session、IPC channel、进程重启、stderr 转发或 dispose 行为。

## Decisions

### D1: 将 runtime spawn helper 从 `{ cmd, args }` 扩展为 `{ cmd, args, env }`

`buildSpawnArgs()` 应调整为更准确的 runtime spawn spec helper，例如返回 `{ cmd: string; args: string[]; env: NodeJS.ProcessEnv }`，并由 `startProcess()` 直接传给 `cross-spawn`。

环境变量合并规则与 installer 保持一致：

- distribution env 不存在时，传入 `process.env`，保持现有行为。
- distribution env 存在时，传入 `{ ...process.env, ...distribution.env }`。
- distribution env 的同名 key 覆盖父进程环境。
- 不记录 env 内容到日志，避免泄露 token、路径或其他敏感值。

备选方案是只传 distribution env，不继承 `process.env`。这会破坏 PATH、HOME、SHELL、系统代理等常见运行时依赖，因此不采用。

### D2: binary 启动命令继续来自 installed record，runtime metadata 来自当前平台 registry entry

binary agent 安装后，真实可执行文件路径由 `AcpInstalledRecord.installPath` 记录。runtime spawn 仍应把 `installPath` 作为 `cmd`，不重新根据 registry 的 `cmd` 拼接路径。registry 当前平台 binary entry 只提供 runtime metadata：

- `args?: string[]`
- `env?: Record<string, string>`

实现时复用 `src/main/domain/acp/detector.ts#resolveBinaryDistribution()` 解析当前平台 entry，保持平台 key 选择规则与安装/检测一致。如果存在匹配 entry，就读取其 `args` / `env`；如果没有匹配 entry，但 installed record 仍有 `installPath`，则保持兼容行为：用 `installPath`、空参数和 `process.env` 启动，不因为缺少 registry 平台 entry 引入新的启动错误。

备选方案是 runtime 缺少平台 entry 时直接报错。该方案会改变已有 installed record 的启动容错行为，且不能帮助已安装 agent 恢复，因此不采用。

### D3: 保留 npx / uvx 既有参数语义，只补 env

`npx` 与 `uvx` 的参数组装已经存在：

- `npx`: `["--no-install", <bare package>, ...(distribution.npx.args ?? [])]`
- `uvx`: `[distribution.uvx.package, ...(distribution.uvx.args ?? [])]`

本次不改变这些参数语义，只把对应 distribution env 合并进 spawn options。`npx` 继续剥离 registry package spec 的版本后缀，避免 `npx --no-install` 尝试使用 registry 版本而不是本地已安装版本。

## Risks / Trade-offs

- distribution env 可能覆盖父进程环境中的关键变量 -> Mitigation：这是 registry 明确声明的启动需求，且与安装/卸载流程现有合并语义一致；测试覆盖同名 key 覆盖行为。
- binary args 进入现有 spawn 日志后可能暴露敏感参数 -> Mitigation：本次不新增 env 日志；如 registry 未来需要 secret，应通过 env 而不是 args 承载。现有日志行为不在本次范围内调整。
- registry cache 中旧 binary entry 没有 `args` / `env` -> Mitigation：字段为 optional，旧缓存无需迁移，缺失时按空参数和 `process.env` 处理。
- 共享类型扩展后 renderer 也能看到 binary env -> Mitigation：这是 registry 原始数据的一部分；本次不新增 UI 展示，不在日志中输出 env。

## Migration Plan

无持久化迁移。`registry-cache.json` 是 registry 原始数据缓存，旧缓存缺少可选字段时仍可读取；后台刷新后自然获得新字段。`installed.json` 结构不变。
