## 1. 运行时启动契约

- [x] 1.1 修改 `src/shared/types/acp-agent.ts` 中的 `AcpAgentBinaryDistribution`，新增 `args?: string[]` 与 `env?: Record<string, string>`；保持字段 optional，不修改 `AcpInstalledRecord`，不新增迁移脚本。
- [x] 1.2 修改 `src/main/infra/process/acp-process-pool.ts` 的 spawn spec 组装逻辑：让现有 `buildSpawnArgs()` 或其替代函数返回 `{ cmd, args, env }`；`env` 合并规则为 distribution env 存在时 `{ ...process.env, ...distribution.env }`，否则 `process.env`。
- [x] 1.3 在 `src/main/infra/process/acp-process-pool.ts` 中为 `npx` / `uvx` runtime spawn 读取对应 `distribution.npx.env` / `distribution.uvx.env`；保持现有 `npx` bare package 处理与 `uvx` 参数顺序不变。
- [x] 1.4 在 `src/main/infra/process/acp-process-pool.ts` 中为 `binary` runtime spawn 复用 `src/main/domain/acp/detector.ts#resolveBinaryDistribution()` 获取当前平台 entry；命令继续使用 `AcpInstalledRecord.installPath`，参数使用 `binary.args ?? []`，env 使用当前平台 entry 的 `env` 合并结果。
- [x] 1.5 保持 spawn 日志不输出 env；确认缺少 binary 平台 entry 时仍按 `installPath`、空参数和 `process.env` 启动，不引入新的启动错误。

## 2. 测试

- [x] 2.1 扩展 `test/main/infra/process/acp-process-pool.spec.ts`，新增 npx agent 用例：registry `distribution.npx` 含 package、args、env 时，断言 `cross-spawn` 收到 `cmd === "npx"`、正确剥离版本后的 args，以及合并后的 env。
- [x] 2.2 扩展 `test/main/infra/process/acp-process-pool.spec.ts`，新增 uvx agent 用例：registry `distribution.uvx` 含 package、args、env 时，断言 `cross-spawn` 收到 `cmd === "uvx"`、正确 args，以及合并后的 env。
- [x] 2.3 扩展 `test/main/infra/process/acp-process-pool.spec.ts`，新增 binary agent 用例：registry 当前平台 binary entry 含 args、env 且 installed record 含 installPath 时，断言 `cross-spawn` 使用 installPath、binary args 和合并后的 env。
- [x] 2.4 扩展 `test/main/infra/process/acp-process-pool.spec.ts`，覆盖 binary 当前平台 entry 缺失或未声明 args/env 时仍使用空 args 与 `process.env`，避免回归既有兼容行为。

## 3. Verification

- [x] 3.1 运行 `pnpm vitest run test/main/infra/process/acp-process-pool.spec.ts`，确认 ACP 进程池单测通过。
- [x] 3.2 运行 `pnpm typecheck`，确认共享类型扩展不破坏 main / renderer 类型检查。
- [x] 3.3 运行 `pnpm lint`，确认主进程导入、cross-spawn 使用和 TypeScript 规则通过。
