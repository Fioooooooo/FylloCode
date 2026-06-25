## Why

重启 FylloCode 后，已经产生 proposal 的 chat session 重新打开时可能不再展示 `ChatProposalPanel`，尤其是已归档 proposal 因 archive 目录名带日期前缀而无法用 lineage 中的原始 `changeId` 精确匹配。现有规格已经要求 EventRail 展示当前 session 关联的所有 proposal，因此这是恢复路径没有履行既有契约的 bug。

## What Changes

- 修复 `useSessionStore` 在进入 session 时从 `lineage:getBySession` 回填 proposal 的匹配逻辑，使 lineage 中的原始 `changeId` 能匹配 active proposal，也能匹配 archive 目录名形如 `YYYY-MM-DD-<changeId>` 的 archived proposal。
- 回填后继续展示 archived proposal，但不再为 archived proposal 调用 `proposal:watch`；只有 `creating`、`draft`、`applying` 等非终态 proposal 需要启动主进程状态监听。
- 补齐 `lineage:getBySession` 的 IPC 规格描述，明确 renderer 可用它读取 session 所属 lineage 及该 session 的 proposal 产出列表。
- 增加 renderer store 测试，覆盖 session 重开/切换后的 proposal 回填、archive id 匹配和 archived 不 watch 的行为。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `chat-event-rail-proposal-status`: 明确 Chat EventRail 在进入 session 时必须从 lineage 回填历史 proposal，并只对非 archived proposal 启动状态监听。
- `lineage-ipc`: 补齐 `lineage:getBySession` channel 的渲染进程 IPC 契约，用于按 session 查询 lineage 投影。

## Impact

- 影响 `src/renderer/src/stores/session.ts` 的 `backfillSessionProposals` / watch 启动边界。
- 影响 `test/renderer/src/stores/session.spec.ts` 的 lineage/proposal API mock 与新增恢复场景。
- 不新增 IPC channel，不改变持久化 schema，不改变 `ProposalMeta.id` 的主进程返回格式。
