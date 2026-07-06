## Why

`fyllo-specs` 的 `create-proposal` 会通过 `createChange` 生成 OpenSpec change 的 `.openspec.yaml`，但当前只修正 `status` 字段，未保证 `created` 字段记录真实创建时间。默认 OpenSpec CLI 可能生成日期正确但时分秒为 `00:00:00.000Z` 的时间戳，导致 proposal 创建时间在列表、概览和溯源中不够准确。

## What Changes

- `createChange` 在写回 `.openspec.yaml` 时 SHALL 写入 `created: new Date().toISOString()`。
- 如果 `.openspec.yaml` 已有 `created` 字段，系统 SHALL 用当前 ISO 时间字符串覆盖它。
- 如果 `.openspec.yaml` 没有 `created` 字段，系统 SHALL 新增该字段。
- 写回 YAML 时 SHALL 保证 `created` 字段位于 `status` 字段之前，且 `status` 仍写为 `creating`。
- 不改变 `create-proposal` 的 MCP 输入参数、返回结构、workspace 策略或 artifact 指令生成流程。

## Capabilities

### New Capabilities

- `openspec-change-metadata`: 约束 `fyllo-specs` 创建 OpenSpec change 时写入 `.openspec.yaml` 的元数据字段。

### Modified Capabilities

无。

## Impact

- 影响代码：`src/mcp-servers/fyllo-specs/src/runtime-openspec/create-change.ts`。
- 影响测试：`test/mcp-servers/fyllo-specs/openspec-runtime.test.ts`。
- 影响持久化文件：新建 proposal 的 `openspec/changes/<changeName>/.openspec.yaml`。
- 不新增依赖，不改变 IPC、preload、renderer 或 MCP tool schema。
