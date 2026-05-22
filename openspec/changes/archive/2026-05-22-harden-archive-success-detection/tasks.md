## 1. 新增 parse-archive-outcome 纯函数

- [x] 1.1 在 `mcp-servers/fyllo-specs/src/runtime-openspec/parse-archive-outcome.ts` 新增模块。导出：
  - 类型 `ArchiveOutcome = { kind: "success" } | { kind: "known-failure"; signal: ArchiveFailureSignal } | { kind: "unknown" }`
  - 类型 `ArchiveFailureSignal = "validation-failed" | "spec-update-aborted" | "no-change-selected" | "archive-cancelled"`
  - 函数 `parseArchiveOutcome(stdout: string, changeName: string): ArchiveOutcome`
  - 内部常量 `FAILURE_SIGNALS: { signal: ArchiveFailureSignal; pattern: string }[]`，按 design.md 表格定义，每条带 `archive.js@1.3.1` 行号注释
  - 内部 helper `escapeRegExp(s: string): string`（标准实现：替换 `[.*+?^${}()|[\]\\]` 为 `\\$&`）
  - 文件顶部注释固定依据：`@fission-ai/openspec@1.3.1` 的 `dist/core/archive.js:268`
- [x] 1.2 判定顺序：先按子串 `String.prototype.includes` 命中失败信号字典 → `kind: "known-failure"`；再用 `new RegExp("Change '" + escapeRegExp(changeName) + "' archived as '\\d{4}-\\d{2}-\\d{2}-" + escapeRegExp(changeName) + "'\\.")` 测试成功 → `kind: "success"`；都不命中 → `kind: "unknown"`。
  - 验收：`Aborted. No files were changed.` 与 `archived as` 同时出现时返回 `kind: "known-failure"`（设计上失败优先；理论不会同时出现，但保守优先级）。

## 2. 新增 OpenspecArchiveNotConfirmedError

- [x] 2.1 在 `mcp-servers/fyllo-specs/src/runtime-openspec/spawner.ts` 同模块（与 `OpenspecCliError`、`OpenspecTimeoutError` 并列）新增类 `OpenspecArchiveNotConfirmedError extends Error`。
  - 实施偏离：`OpenspecCliError` / `OpenspecTimeoutError` 实际定义在 `runtime-openspec/types.ts`；新错误类按既有约定放在 `types.ts`，由 `index.ts` 统一 re-export。
  - 构造函数签名：`constructor(signal: string, rawOutputExcerpt: string, changeName: string)`
  - 设置 `this.name = "OpenspecArchiveNotConfirmed"`
  - 公开属性 `signal: string`、`rawOutputExcerpt: string`、`changeName: string`
  - message 格式：`OpenSpec archive did not confirm completion (signal=${signal}). stdout(<=800B)=${rawOutputExcerpt}`
- [x] 2.2 同文件 export 该类。

## 3. 在 archiveChange 中接入判定

- [x] 3.1 修改 `mcp-servers/fyllo-specs/src/runtime-openspec/archive-change.ts`：
  - 在 spawn 完成、得到 `archiveRawOutput` 后，调用 `parseArchiveOutcome(archiveRawOutput, name)`
  - `kind === "success"`：保持当前行为，正常返回 `ArchiveResult`
  - `kind === "known-failure"`：抛 `new OpenspecArchiveNotConfirmedError(outcome.signal, archiveRawOutput.slice(0, 800), name)`
  - `kind === "unknown"`：抛 `new OpenspecArchiveNotConfirmedError("success-marker-missing", archiveRawOutput.slice(0, 800), name)`
- [x] 3.2 import：从 `./parse-archive-outcome` 导入 `parseArchiveOutcome`，从 `./spawner` 导入 `OpenspecArchiveNotConfirmedError`。
  - 实施偏离：错误类按 2.1 偏离实际从 `./types` 导入。

## 4. 在 archive-change tool 区分 error code

- [x] 4.1 修改 `mcp-servers/fyllo-specs/src/tools/archive-change.ts` 的 catch 块（行 151-173 现有逻辑）：
- [x] 4.2 检查 `mcp-servers/fyllo-specs/src/runtime-openspec/index.ts`：若已统一从此导出 `OpenspecCliError` 等错误类型，把 `OpenspecArchiveNotConfirmedError` 一并导出，保持 tool 层 import 风格一致。

## 5. 单元测试

- [x] 5.1 新建 `mcp-servers/fyllo-specs/src/runtime-openspec/__tests__/parse-archive-outcome.test.ts`（若 `__tests__` 不存在则新建该目录）。
  - 实施偏离：项目 `vitest.config.mts` 仅 include `mcp-servers/fyllo-specs/__tests__/**`，因此实际测试文件落在 `mcp-servers/fyllo-specs/__tests__/parse-archive-outcome.test.ts`，相对路径 import `../src/runtime-openspec/parse-archive-outcome`。
- [x] 5.2 用例覆盖（每个用例一个 `it`）：
- [x] 5.3 运行 `pnpm test` 确认全部通过。
  - 结果：`parse-archive-outcome.test.ts` 11/11 通过；`runtime.test.ts` 中两条 `rebases linked workspace ...` 与 `returns agent recovery when automatic rebase conflicts` 失败。已通过 `git stash` 后在 dev HEAD 上复现，**与本次改动无关，是预先存在的失败**。
- [x] 5.4 运行 `pnpm typecheck` 与 `pnpm lint` 全部通过。

## 6. 验证不影响构建与既有测试

- [x] 6.1 运行 `pnpm build`（含 typecheck），确认 `mcp-servers/fyllo-specs` 构建通过。
- [x] 6.2 若仓库中已有 `tools/archive-change` 或 `runtime-openspec/archive-change` 相关测试，确认通过；如有 mock spawn 的测试，需对应增加成功标记或调整断言。
  - 结果：未发现现存的 `archiveChange` mock spawn 测试。`runtime.test.ts`、`tools.test.ts`、`openspec-runtime.test.ts` 中除 5.3 已说明的两条预存失败外，其余全部通过。
