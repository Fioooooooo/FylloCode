## Why

OpenSpec 在归档新增 capability 时会为不存在的 main spec 创建 skeleton，并把 `## Purpose` 写成 `TBD - created by archiving change ...`。当前 `archive-change` tool instruction 只要求同步、归档和汇报，agent 调用后没有被要求回头替换这些占位，导致正式 `openspec/specs/**/spec.md` 长期保留 TODO 文本。

## What Changes

- 补充 `archive-change` tool instruction：归档同步产生新 main spec 后，agent 必须检查本次新增 spec 的 `## Purpose` 是否仍是 OpenSpec skeleton 占位。
- 定义 Purpose 替换规则：用一段简洁文字描述该 capability 的职责、行为边界和主要契约来源；不得保留 `TBD`、`created by archiving change`、change 名称或归档过程描述。
- 要求 Archive 完成汇报包含 Purpose 占位检查结果，且不得在本次新增 spec 仍保留 skeleton Purpose 时声称归档完成。
- 不改变 `archive-change` tool 的输入字段、返回 state 结构、OpenSpec archive runtime、git finalization 顺序或提交信息格式校验。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `fyllo-specs-archive`: 补充 Archive 阶段 tool instruction 对新建 main spec Purpose 占位的检查、替换和汇报要求。

## Impact

- 影响 `src/mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md` 的归档工作流指令。
- 影响 `test/mcp-servers/fyllo-specs/tools.test.ts` 或等效 MCP tool instruction 测试，防止该要求被删除。
- 不修改 OpenSpec CLI 依赖源码，不新增 runtime 自动改写逻辑，不改变 archive 工具 schema。
