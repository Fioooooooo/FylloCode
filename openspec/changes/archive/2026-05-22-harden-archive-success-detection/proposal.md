## Why

`archive-change` 当前只用 OpenSpec CLI 的 exit code 判断归档是否成功。但 `@fission-ai/openspec@1.3.1` 的 `dist/core/archive.js` 中存在多条「未真正归档却以 exit 0 返回」的灰色路径（校验失败、spec 重写失败、未选 change 等）。这些路径会让 tool 误以为 archive 成功，从而继续执行 `git commit / merge / worktree remove / branch -d` —— 在 linked worktree 模式下，等于在没有归档的情况下删除工作区与分支，丢失工作。

## What Changes

- 把 `runtime-openspec#archiveChange` 的成功判定从「exit code === 0」收紧为「exit code === 0 **且** stdout 命中 OpenSpec 的真实归档完成标记」。
- 真实归档完成标记来源于 `archive.js:268` 的唯一一处 `console.log`，文本形如：`Change '<changeName>' archived as '<YYYY-MM-DD>-<changeName>'.`。判定时 SHALL 把 `changeName` 嵌入正则（先做正则元字符转义），避免松匹配误判。
- 当 exit code 为 0 但未命中成功标记时，`runtime-openspec#archiveChange` SHALL 抛出 `OpenspecArchiveNotConfirmedError`，由 `archive-change` tool 的现有 catch 路径接住，转成结构化失败 state（新增 error code `openspec-archive-not-confirmed`），`gitOps` 保持空数组。
- 在错误 message 中携带触发判定的信号（`success-marker-missing` 或具体失败关键词，如 `validation-failed` / `spec-update-aborted` / `no-change-selected`）以及前 800 字符的 raw stdout 截断，便于 agent 诊断。
- 新增针对 `parseArchiveOutcome` 的纯函数单元测试，覆盖：成功文本、四条已知 exit-0 失败路径、空 stdout、unknown 兜底分支、changeName 含正则元字符场景。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `fyllo-specs-mcp`: 收紧 `archive-change` 在 OpenSpec archive 阶段的成功判定，新增 exit-0 但未确认归档时的失败 state（不影响其他 tool 行为）。

## Impact

- 受影响代码：
  - `mcp-servers/fyllo-specs/src/runtime-openspec/archive-change.ts`：新增 `parseArchiveOutcome` 与 `OpenspecArchiveNotConfirmedError`，在 spawn 后调用。
  - `mcp-servers/fyllo-specs/src/tools/archive-change.ts`：catch 中按 error 类型分流出新的 `error.code: "openspec-archive-not-confirmed"`，retryHint 文案对应调整。
  - `mcp-servers/fyllo-specs/src/runtime-openspec/__tests__/archive-change.test.ts`（新增或在已有测试同目录补充 `parse-archive-outcome.test.ts`）。
- 不影响：`runtime-workspace`、`finalize-archive-workspace.ts`、其他 tool。
- 依赖：依赖 `@fission-ai/openspec@1.3.1` 的输出文本约定。版本升级时需要重看 `archive.js` 的输出语句是否变更（在判定函数旁注释固定版本与源行号）。
- 行为契约变化：tool 调用方会看到新的 `error.code`，`status: "failed"` 的覆盖范围扩大（原本会假成功的灰色路径现在会显式失败）。这是修正而不是新增能力，对正常归档路径没有可观察影响。
