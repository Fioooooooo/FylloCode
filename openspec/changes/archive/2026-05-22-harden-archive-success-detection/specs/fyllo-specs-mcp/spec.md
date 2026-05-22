## ADDED Requirements

### Requirement: archive-change 通过 stdout 成功标记确认 OpenSpec 归档完成

`archive-change` tool 在 `confirm: true` 时 SHALL 将 OpenSpec CLI 的「归档成功」判定收紧为：CLI 子进程 exit code 等于 0 **且** stdout 命中真实归档完成标记。仅 exit code 为 0 不足以判定为成功。

「真实归档完成标记」定义为下列正则匹配（设输入 changeName 为 `<name>`，转义后为 `<escaped>`，并允许任意字符出现在前后）：

```
Change '<escaped>' archived as '\d{4}-\d{2}-\d{2}-<escaped>'\.
```

该标记来源于 `@fission-ai/openspec@1.3.1` 的 `dist/core/archive.js:268`，并且在 `archive.js` 内为唯一字面量来源。

判定为非成功时（含 exit code 非 0、exit 0 但未命中成功标记），`runtime-openspec#archiveChange` SHALL 抛出错误，由 tool 层 catch 路径转换为 `state.status === "failed"`，且 `state.workspace.gitOps` SHALL 保持空数组、不执行 `commit` / `merge-to-main` / `rebase-onto-main` / `merge-to-main-retry` / `worktree-remove` / `branch-delete` 任一 git step。

tool 层 SHALL 区分两类 archive 失败的 `error.code`：

- `openspec-archive-failed`：CLI 子进程 exit code 非 0，或 spawn / 超时异常。
- `openspec-archive-not-confirmed`：CLI 子进程 exit code 为 0 但 stdout 未命中成功标记。

`openspec-archive-not-confirmed` 错误 message SHALL 携带触发判定的信号（取自下表），并 SHALL 包含 stdout 前 800 字符的截断片段：

| signal 值                | 含义                             | 触发文本（stdout `includes`）                                |
| ------------------------ | -------------------------------- | ------------------------------------------------------------ |
| `validation-failed`      | OpenSpec delta spec 校验未过     | `Validation failed. Please fix the errors before archiving.` |
| `spec-update-aborted`    | 主 specs 重写或校验失败          | `Aborted. No files were changed.`                            |
| `no-change-selected`     | `--yes` 下无可选 change          | `No change selected. Aborting.`                              |
| `archive-cancelled`      | 用户取消（防御保留）             | `Archive cancelled.`                                         |
| `success-marker-missing` | 上述均未命中且无成功标记（兜底） | （兜底分支）                                                 |

`runtime-openspec` SHALL 通过纯函数 `parseArchiveOutcome(stdout: string, changeName: string)` 实现该判定，函数返回联合类型 `{ kind: "success" } | { kind: "known-failure"; signal } | { kind: "unknown" }`，其中 `signal` 取自上表。该函数 SHALL 不依赖 fs / spawn / 网络 I/O，可独立单元测试。

#### Scenario: exit 0 且 stdout 命中成功标记视为成功

- **WHEN** `runtime-openspec#archiveChange(projectRoot, "my-change", { confirm: true })` 调用 OpenSpec CLI
- **AND** 子进程 exit code 等于 0
- **AND** stdout 包含 `Change 'my-change' archived as '2026-05-22-my-change'.`
- **THEN** `runtime-openspec#archiveChange` 返回 `archiveRawOutput` 为完整 stdout
- **AND** `tools/archive-change.ts` 继续调用 `runtime-workspace#finalizeArchiveWorkspace`

#### Scenario: exit 0 但 stdout 未命中成功标记视为失败

- **WHEN** OpenSpec CLI 子进程 exit code 等于 0
- **AND** stdout 不包含与 `Change '<changeName>' archived as '<date>-<changeName>'.` 匹配的标记
- **THEN** `state.status === "failed"`
- **AND** `state.archive.ok === false`
- **AND** `state.archive.error.code === "openspec-archive-not-confirmed"`
- **AND** `state.archive.error.message` 包含触发的 signal
- **AND** `state.archive.error.message` 包含 stdout 前 800 字符截断
- **AND** `state.workspace.gitOps` 为空数组

#### Scenario: 校验失败信号被识别

- **WHEN** OpenSpec CLI 子进程 exit code 等于 0
- **AND** stdout 包含 `Validation failed. Please fix the errors before archiving.`
- **THEN** `state.archive.error.code === "openspec-archive-not-confirmed"`
- **AND** message 中的 signal 字段值为 `validation-failed`
- **AND** `state.workspace.gitOps` 为空数组

#### Scenario: spec 更新失败信号被识别

- **WHEN** OpenSpec CLI 子进程 exit code 等于 0
- **AND** stdout 包含 `Aborted. No files were changed.`
- **THEN** `state.archive.error.code === "openspec-archive-not-confirmed"`
- **AND** message 中的 signal 字段值为 `spec-update-aborted`
- **AND** `state.workspace.gitOps` 为空数组

#### Scenario: 未知未确认输出兜底失败

- **WHEN** OpenSpec CLI 子进程 exit code 等于 0
- **AND** stdout 既不包含成功标记也不包含任何已知失败信号
- **THEN** `state.archive.error.code === "openspec-archive-not-confirmed"`
- **AND** message 中的 signal 字段值为 `success-marker-missing`
- **AND** `state.workspace.gitOps` 为空数组

#### Scenario: changeName 含正则元字符不影响匹配

- **WHEN** `changeName` 含 `.`、`+`、`(` 等正则元字符
- **AND** stdout 形如 `Change '<changeName>' archived as '<date>-<changeName>'.`
- **THEN** `parseArchiveOutcome` 返回 `kind: "success"`
- **AND** 不抛出正则编译错误

#### Scenario: 成功标记中 changeName 不匹配视为未知

- **WHEN** 调用 `parseArchiveOutcome(stdout, "feature-a")`
- **AND** stdout 仅包含 `Change 'feature-b' archived as '2026-05-22-feature-b'.`
- **THEN** 返回 `kind: "unknown"`
- **AND** 不返回 `kind: "success"`

#### Scenario: spawn 异常仍归类为 archive-failed

- **WHEN** OpenSpec CLI 子进程 exit code 非 0
- **OR** spawn 抛出 `OpenspecCliError` / `OpenspecTimeoutError`
- **THEN** `state.archive.error.code === "openspec-archive-failed"`
- **AND** `state.workspace.gitOps` 为空数组
