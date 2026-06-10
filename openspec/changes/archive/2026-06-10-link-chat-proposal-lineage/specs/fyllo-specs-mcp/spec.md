## ADDED Requirements

### Requirement: create-proposal 在创建成功后写出 MCP 事件文件

`create-proposal` 工具（`src/mcp-servers/fyllo-specs/src/tools/create-proposal.ts`）SHALL 在 `runtime-openspec#createChange(projectRoot, changeName)` 成功返回之后、向调用方返回 state 之前，向环境变量 `FYLLO_MCP_EVENT_DIR` 指向的目录写出一个 proposal 创建事件文件。

事件文件 SHALL 满足 `lineage-proposal-link` spec 定义的「MCP 事件文件格式与原子写」：文件名 `<timestamp>-<nanoid>.json`，内容 `{ server: "fyllo-specs", tool: "create-proposal", createdAt: <ISO8601>, sessionId: <FYLLO_SESSION_ID>, changeId: <changeName> }`，采用先写临时文件再 rename 的原子写。`changeId` SHALL 取自工具入参 `changeName`（与 `createChange` 使用的同一值）。`sessionId` SHALL 取自环境变量 `FYLLO_SESSION_ID`。

写出 SHALL 为「尽力而为」的副作用：

- 仅当 `FYLLO_MCP_EVENT_DIR` 与 `FYLLO_SESSION_ID` 两个环境变量均存在且非空时才写出事件文件；任一缺失时 SHALL 跳过写出，且 SHALL NOT 影响 `create-proposal` 的正常 state 返回。
- 事件写出失败（如目录不可写）SHALL NOT 阻断 `create-proposal` 的成功返回；失败 SHALL 被吞掉或记日志，不上抛为工具错误。

事件写出 SHALL NOT 改变 `create-proposal` 既有的 state 返回结构（`changeName` / `workspace` / `artifacts` / `template` / `instruction` / `nextArtifact` / `warnings` 等字段不受影响）。

#### Scenario: 两个 env 齐备时写出事件

- **WHEN** `create-proposal` 成功创建 changeName 为 `add-foo` 的 change
- **AND** 环境变量 `FYLLO_MCP_EVENT_DIR` 与 `FYLLO_SESSION_ID="sess-1"` 均存在
- **THEN** 在 `FYLLO_MCP_EVENT_DIR` 下新增一个事件文件，内容 `changeId === "add-foo"`、`sessionId === "sess-1"`
- **AND** 工具仍正常返回 create-proposal state

#### Scenario: 缺少 FYLLO_SESSION_ID 时跳过写出

- **WHEN** `create-proposal` 成功创建 change
- **AND** 环境变量 `FYLLO_SESSION_ID` 缺失或为空
- **THEN** 不写出任何事件文件
- **AND** 工具仍正常返回 create-proposal state

#### Scenario: 事件写出失败不阻断工具返回

- **WHEN** `create-proposal` 成功创建 change，但事件目录写入因故失败
- **THEN** 写出失败被吞掉或记日志，不上抛为工具错误
- **AND** 工具仍正常返回 create-proposal state
