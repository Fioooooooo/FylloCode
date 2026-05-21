## Why

`create-proposal` 目前会把新 change 置为 `creating`，但完成 required artifacts 之后没有明确的状态收口，容易让已完成的 proposal 停留在创建中。这样会让详情页继续隐藏“开始实现”入口，用户只能靠人工补写状态来恢复流程。

## What Changes

- 明确 `creating -> draft` 的收口责任由 `create-proposal` 工作流承担。
- 更新 `create-proposal` prompt，使 agent 在所有 required artifacts 完成后，显式把 `.openspec.yaml` 的 `status` 写回 `draft`。
- 保持 `explore` 为纯读取，不参与任何状态推进。
- 不改变 `draft -> applying` 和 `applying -> archived` 的既有行为。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `fyllo-specs-mcp`: 调整 `create-proposal` / `explore` 的 prompt 契约，明确创建完成后必须落到 `draft`。

## Impact

- `mcp-servers/fyllo-specs/src/tools/instructions/create-proposal.md`
- `mcp-servers/fyllo-specs/src/tools/instructions/explore.md`
- `mcp-servers/fyllo-specs/__tests__/prompts.test.ts`
- `openspec/specs/fyllo-specs-mcp/spec.md`
