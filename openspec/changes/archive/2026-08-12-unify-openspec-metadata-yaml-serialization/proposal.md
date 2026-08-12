## Why

`fyllo-specs` 创建 change 时使用 `CORE_SCHEMA` 输出无引号的 ISO 时间字符串，但 Apply 与 Archive 通过默认 `js-yaml.dump()` 重写同一份 `.openspec.yaml`，会把 `created` 改成带单引号形式并产生与状态更新无关的格式 diff。需要让 `fyllo-specs` 生命周期中的三条写入路径复用同一序列化规则。

## What Changes

- 在 `fyllo-specs` runtime 内抽取专用于 OpenSpec metadata 的 YAML 读写 util，并统一使用 `CORE_SCHEMA` 序列化。
- 让 Create、MCP Apply 和 Archive 写回 `.openspec.yaml` 时都通过该 util，保持 ISO 时间字符串为无引号 plain scalar。
- 保持 metadata 字段值、字段顺序和现有状态转换不变，只消除不同阶段之间的序列化差异。
- 增加回归测试，覆盖 Create、Apply、Archive 写回后 `created` 不带引号且其他 metadata 字段仍被保留。
- 不调整 Main Process 的 Apply workflow、Plan/Knowledge frontmatter 或 Workflow YAML 序列化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `openspec-change-metadata`: 将 metadata 序列化约束从创建阶段扩展到 `fyllo-specs` 的 Create、Apply、Archive 状态写回，并明确 ISO 时间字符串保持无引号。
- `fyllo-specs-archive`: 明确归档状态写回在保留其他 metadata 字段和值的同时，也保持统一的无引号 ISO 时间表示。

## Impact

- 受影响代码：`src/mcp-servers/fyllo-specs/src/runtime-openspec/create-change.ts`、`fs.ts`、`tasks.ts`、`archive-change.ts` 及新增或调整的同目录 util。
- 受影响测试：`test/mcp-servers/fyllo-specs/openspec-runtime.test.ts`，必要时增加针对公共 util 的聚焦测试。
- 不新增依赖，不改变 MCP tool 输入输出、Proposal lifecycle 状态、OpenSpec CLI 调用或历史 archive 文件。
