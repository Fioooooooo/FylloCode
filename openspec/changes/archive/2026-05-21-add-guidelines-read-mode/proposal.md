## Why

`fyllo-cortex` MCP 内置的 `guidelines` 工具当前只有一种行为：调用即返回近 200 行的写作合约。Agent 在 Chat 阶段只想知道"项目里有哪些 guideline 文档、各管什么"时也会触发这段长指令，浪费上下文，并且不能从工具响应中获得任何用户项目里的实际 guideline 信息，引导 agent 主动查阅项目自带 guidelines 的能力被埋没。

## What Changes

- **BREAKING**：`guidelines` 工具改为 `mode: "read" | "write"` 必填入参（无默认值）。原来"调用即返回 instruction"的行为不再保留。
- 新增 `mode=read` 行为：递归扫描项目 `guidelines/**/*.md`，解析 YAML frontmatter，返回每个文件的 `path` / `name` / `description` / `keywords` 列表，作为 agent 决定"是否进一步 Read 完整文件"的轻量索引。
- 保留 `mode=write` 行为：返回 `instructions/guidelines.md` 包裹在 `<tool_instruction>` 内的写作合约（与今天 `mode` 缺省时的输出语义一致）。
- 在 `instructions/guidelines.md` 中新增 frontmatter 章节，定义 `name` / `description` / `keywords` 三个建议字段，明确"非强制"。
- 重写工具 `description`，反映 read/write 双模式以及各自用途，使 agent 仅看 description 即可正确选择模式。
- 不迁移 FylloCode 自身 `guidelines/*.md`：本次提案只修改工具与合约，repo 内现有文档保持原貌。
- 不修改主进程注入的 system-reminder / CLAUDE.md / Chat 阶段提示模板。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `fyllo-cortex-mcp`: `guidelines` 工具的入参契约、响应形态、instruction 内容范围全部改变；现有"无参数 + 仅返回 tool_instruction + 不读取仓库"等 SHALL 子句被本次改动推翻，需要更新。

## Impact

- **代码**：
  - `mcp-servers/fyllo-cortex/src/tools/guidelines.ts`（input schema、handler 分发、frontmatter 解析、目录遍历）
  - `mcp-servers/fyllo-cortex/src/tools/instructions/guidelines.md`（新增 frontmatter 章节）
  - `mcp-servers/fyllo-cortex/__tests__/tools.test.ts`（覆盖 read / write 两种模式以及 frontmatter 缺失/损坏容错）
- **依赖**：复用 `package.json` 已有的 `js-yaml`，不引入新包。
- **构建产物**：`scripts/build-mcp-servers.mjs` 输出的 `fyllo-cortex` 入口需要重新构建；现有 `.md` 文本 loader 配置不变。
- **MCP 客户端 / agent 行为**：所有调用 `guidelines` 的 agent 必须显式传 `mode`。Fyllo 自身在 Chat 阶段对 `guidelines` 的引用文案需要 agent 在自己运行时按新工具描述选择模式（不通过本提案修改主进程模板）。
- **现有 spec**：`openspec/specs/fyllo-cortex-mcp/spec.md` 中关于"无参数"以及"不返回 discovery 结果"的两条 Requirement 需要在本次 change 内通过 MODIFIED delta 改写。
