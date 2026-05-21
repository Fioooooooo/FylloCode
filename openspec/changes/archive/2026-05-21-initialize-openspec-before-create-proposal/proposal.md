## Why

`fyllo-specs` 的 `create-proposal` 当前在调用 OpenSpec CLI 创建 change 前，默认目标 workspace 已经完成 OpenSpec 项目初始化。对于缺少 `openspec/changes/archive/`、`openspec/specs/` 或 `openspec/config.yaml` 的本地目录，后续 `createChange` 会失败，导致 proposal 创建流程无法自恢复。

## What Changes

- 在 `runtime-openspec` 内部补齐 OpenSpec 初始化前置能力，确保 `createChange(projectRoot, changeName)` 执行前目标项目具备最小 OpenSpec 目录和配置。
- 初始化检查 SHALL 创建缺失的 `openspec/changes/archive/` 与 `openspec/specs/` 目录。
- 当 `openspec/config.yaml` 缺失时，初始化检查 SHALL 写入默认 `schema: spec-driven` 配置模板；当该文件已存在时 SHALL 保持原内容不覆盖。
- `create-proposal` 继续通过 `runtime-openspec#createChange` 创建 change，不把 OpenSpec 初始化细节扩散到 `runtime-workspace` 或 tool 层。
- 不改变 `explore`、`apply-change`、`archive-change` 的行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `fyllo-specs-mcp`: 修改 `create-proposal` / `runtime-openspec#createChange` 的前置行为，要求创建 change 前自动完成 OpenSpec 最小初始化。

## Impact

- 影响代码：
  - `mcp-servers/fyllo-specs/src/runtime-openspec/create-change.ts`
  - 可能新增 `mcp-servers/fyllo-specs/src/runtime-openspec/init-project.ts` 或同层 helper
  - `mcp-servers/fyllo-specs/src/runtime-openspec/index.ts`
  - `mcp-servers/fyllo-specs/src/tools/create-proposal.ts` 仅在确有必要时接入公开 helper；优先保持调用 `createChange(projectRoot, changeName)` 不变
- 影响测试：
  - `mcp-servers/fyllo-specs/__tests__/openspec-runtime.test.ts`
  - `mcp-servers/fyllo-specs/__tests__/tools.test.ts`
- 影响规范：
  - `openspec/specs/fyllo-specs-mcp/spec.md`
