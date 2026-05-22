## Context

`mcp-servers/fyllo-specs/src/runtime-openspec/archive-change.ts:60-66` 调用 `spawnOpenspec(cliPath, ["archive", name, "--yes"], cwd, {}, false)` 拿到纯文本 stdout，然后**不解析内容**直接当 `archiveRawOutput` 透出。`spawner.ts:107-127` 仅在 `code !== 0` 时抛 `OpenspecCliError`。

通读 `node_modules/@fission-ai/openspec/dist/core/archive.js`（v1.3.1）的 `ArchiveCommand.execute`，可识别以下出口：

| 行号    | 出口             | 文本片段（stdout）                                                    | exit code                                                                 |
| ------- | ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 56      | throw            | (`"No OpenSpec changes directory found. Run 'openspec init' first."`) | 1                                                                         |
| 62-63   | return           | `No change selected. Aborting.`                                       | 0                                                                         |
| 72,76   | throw            | `Change '<name>' not found.`                                          | 1                                                                         |
| 137-139 | return           | `Validation failed. Please fix the errors before archiving.`          | 0                                                                         |
| 152     | return           | `Archive cancelled.`（`--yes` 下不会触发，但理论存在）                | 0                                                                         |
| 175     | return           | `Archive cancelled.`                                                  | 0（incomplete tasks 路径，`--yes` 下走 180 行警告并继续，不会进入此分支） |
| 218-220 | return           | `Aborted. No files were changed.`（buildUpdatedSpec throw）           | 0                                                                         |
| 236-237 | return           | `Aborted. No files were changed.`（rebuilt spec 校验失败）            | 0                                                                         |
| 257     | throw            | `Archive '<archiveName>' already exists.`                             | 1                                                                         |
| 268     | 函数末尾正常返回 | `Change '<name>' archived as '<YYYY-MM-DD>-<name>'.`                  | 0                                                                         |

`archive.js:268` 是 `moveDirectory` 之后**唯一**的"成功消息"`console.log`，且整个文件中再无其他 `archived as '` 字面量。可作为强信号。

## Goals / Non-Goals

**Goals:**

- 让 `archive-change` 在「OpenSpec exit 0 但未真正归档」时也能判定为失败，避免触发后续 git 链。
- 失败 state 给出可诊断的结构化错误（含 raw stdout 片段与命中信号）。
- 不破坏正常归档路径与 preview 模式（preview 已不调用 spawn）。
- 判定逻辑可单元测试，输入是 `(stdout, changeName)`，输出是 outcome。

**Non-Goals:**

- 不改 git finalization 链（`runtime-workspace/finalize-archive-workspace.ts` 不动）。
- 不引入对 `@fission-ai/openspec` 内部模块的 import / require（仍由 README 禁止，且 `package.json#exports` 不开放）。
- 不为 OpenSpec CLI 增加 `--json` 参数（CLI 不支持）。
- 不修改 `spawnOpenspec` 的通用 spawn 逻辑。

## Decisions

### 1. 成功判定锚定 changeName

**决定：** 成功正则为 `new RegExp("Change '" + escapeRegExp(changeName) + "' archived as '\\d{4}-\\d{2}-\\d{2}-" + escapeRegExp(changeName) + "'\\.")`。

**理由：**

- `archive.js:252-268` 中 `archiveName = "${YYYY-MM-DD}-${changeName}"`，文本格式稳定。
- 锚定 changeName 可防御「stdout 携带其他 change 的旧消息」。
- `escapeRegExp` 必要：项目允许 kebab-case，但保险起见，未来若 OpenSpec 放宽命名应仍可用。

**备选：** 仅匹配 `archived as '`。代价是松匹配。否决。

### 2. 失败信号字典与兜底

**决定：** `parseArchiveOutcome` 返回 `{ kind: "success" } | { kind: "known-failure", signal } | { kind: "unknown" }`。失败信号字典：

```ts
const FAILURE_SIGNALS: { signal: string; pattern: string }[] = [
  {
    signal: "validation-failed",
    pattern: "Validation failed. Please fix the errors before archiving.",
  },
  { signal: "spec-update-aborted", pattern: "Aborted. No files were changed." },
  { signal: "no-change-selected", pattern: "No change selected. Aborting." },
  { signal: "archive-cancelled", pattern: "Archive cancelled." },
];
```

**理由：** 所有信号都来自 `archive.js` 中明确的 `console.log` 字面量。`escapeRegExp` 不需要（这些是固定字符串，用 `String.prototype.includes` 判定即可）。注释标注源码版本与行号（`archive.js@1.3.1` 行 62/137/152/175/219/236）。

**兜底：** 既未命中成功也未命中失败 → `kind: "unknown"`，按失败处理。这覆盖未来 OpenSpec 版本变更或我们漏掉的路径，比假阳性安全。

### 3. 错误抛出位置

**决定：** 在 `runtime-openspec/archive-change.ts` 内、紧跟 `spawnOpenspec` 之后调用 `parseArchiveOutcome`，非 success 时直接 `throw new OpenspecArchiveNotConfirmedError(signal, rawOutput, changeName)`，由 `tools/archive-change.ts:147-165` 的现有 try-catch 接住。

**理由：**

- 走异常路径让 tool 层既有的「catch 里 conflicts 不再添加 git ops」逻辑天然奏效，零侵入。
- `OpenspecArchiveNotConfirmedError` 继承 `Error`，`name = "OpenspecArchiveNotConfirmed"`，附属性 `signal: "success-marker-missing" | <known-failure-signal>`、`rawOutputExcerpt: string`（前 800 字符）。

**备选：** 让函数返回 `{ ok, error }` 二元结果，tool 层主动判定。代价：`tools/archive-change.ts` 需要新增分支，可读性下降。否决。

### 4. tool 层 error.code 分流

`tools/archive-change.ts` catch 块中：

```ts
const code =
  error?.name === "OpenspecArchiveNotConfirmed"
    ? "openspec-archive-not-confirmed"
    : "openspec-archive-failed";
```

retryHint 分别为：

- `openspec-archive-failed`：保持原文 `Resolve the OpenSpec archive failure, then call archive-change again.`
- `openspec-archive-not-confirmed`：`OpenSpec exited successfully but did not confirm archival; check the captured stdout for the underlying signal (e.g. validation-failed, spec-update-aborted) before retrying.`

错误 message 拼接：`OpenSpec archive did not confirm completion (signal=<signal>). stdout(800B)=<excerpt>`。

### 5. 单元测试位置与风格

放 `mcp-servers/fyllo-specs/src/runtime-openspec/__tests__/parse-archive-outcome.test.ts`，使用项目已用的 Vitest。被测对象是导出的 `parseArchiveOutcome` 纯函数，**不 mock spawn**。

**最低覆盖用例：**

1. 成功消息精确匹配 → `kind: "success"`。
2. 成功消息但 changeName 不一致 → `kind: "unknown"`（不应误判）。
3. 四条 known failure 各一例（注意 `Aborted. No files were changed.` 在 stdout 任意位置都视为命中）→ 对应 signal。
4. 空 stdout → `kind: "unknown"`。
5. 成功消息夹带前置 `Specs to update:` 等噪声 → `kind: "success"`。
6. changeName 含 `.`、`-` 等正则元字符 → 不影响匹配（用 escapeRegExp）。

## Risks / Trade-offs

| 风险                                                                                                   | 缓解                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenSpec 升级修改输出文本（如把 `archived as '` 改成别的句式）→ 全部归档判定为 unknown，所有归档变失败 | 在 `parse-archive-outcome.ts` 顶部注释钉死 `@fission-ai/openspec@1.3.1` 与具体行号；建议把 openspec 版本从 caret 锁成精确（package.json 中 `"@fission-ai/openspec": "1.3.1"`）。Trade-off：无法自动收到 patch 升级，但安全收益更大 |
| 真正成功的 stdout 出现意外噪声（如 chalk 控制字符）打断匹配                                            | 当前 `archive.js:268` 是 `console.log` 直接调用未走 chalk，无 ANSI 风险。若未来变更，正则使用 `String.prototype.includes` 子串判定可继续工作（不要求行首/锚定行尾）                                                                |
| 兜底 `unknown → 失败` 比当前更严格，可能让原本能跑的边缘场景报错                                       | 这正是修复目的；任何未匹配成功标记的归档都不应触发后续 git 删除                                                                                                                                                                    |
| changeName 中含正则元字符（罕见但 OpenSpec 不强约束）                                                  | `escapeRegExp` 处理；测试用例覆盖                                                                                                                                                                                                  |

## Migration Plan

无运行时迁移成本。改动后：

- 正常归档：行为不变（exit 0 + 成功标记 → success）。
- 已知 exit-0 假阳性路径：变为 `status: "failed"`，跳过 git ops。这是修正，不是回归。
- 调用方（`proposal-archive-action` 等 IPC 消费者）若已经处理 `archive.error`，无需修改；新的 `error.code: "openspec-archive-not-confirmed"` 是新增枚举值，UI 文案可后续按需细化。

## Open Questions

无。
