## Context

`fyllo-specs` 目前有三条 `.openspec.yaml` 写入路径：`create-change.ts#createChange` 在创建后直接使用 `CORE_SCHEMA` 序列化；`tasks.ts#loadApplyState` 与 `archive-change.ts#persistArchivedStatus` 则通过 `fs.ts#writeYamlFile` 使用默认 schema。默认 schema 会把保持为 JavaScript 字符串的 ISO 时间值输出为带单引号标量，因此一次只更新 `status` 的 Apply 或 Archive 也会改变 `created` 的文本表示。

变更受两项边界约束：公共逻辑只放在 `src/mcp-servers/fyllo-specs/**`，bundled MCP 不得依赖 `@main/*`；范围只覆盖 `fyllo-specs` 自己拥有的 Create、MCP Apply 与 Archive，不改变 Main Process 的 Apply workflow 或其他 YAML 文档。

## Goals / Non-Goals

**Goals:**

- 为 `fyllo-specs` 的 OpenSpec metadata 提供唯一的 YAML 读写 util。
- 让 Create、MCP Apply、Archive 使用相同的 `CORE_SCHEMA` 序列化规则。
- 保持 `created` 等 ISO 时间字符串在写回后为无引号 plain scalar，并保留现有字段值、字段插入顺序与状态转换行为。
- 用聚焦测试锁定三条生命周期路径的原始 YAML 输出。

**Non-Goals:**

- 不修改 `src/main/services/proposal/runtime/apply-run-service.ts` 的 Main Apply workflow。
- 不统一 Plan、Knowledge、Migration 或 Workflow Editor 的 YAML/frontmatter 输出。
- 不改为逐行文本替换，不承诺保留注释、空行或原始引号风格等 YAML 表面格式。
- 不批量重写已有 active change 或历史 archive。

## Decisions

### 1. 新增 `runtime-openspec/metadata-yaml.ts` 作为 metadata 专用 util

该模块导出 metadata 读取与写入函数，内部统一调用 `js-yaml.load()` 和 `dump(value, { schema: CORE_SCHEMA })`。`create-change.ts`、`tasks.ts` 与 `archive-change.ts` 只通过该模块读写 `.openspec.yaml`；`fs.ts#readYamlFile` 继续服务于 `openspec/config.yaml` 等普通读取，并移除不再使用的通用写入函数。

选择专用模块而不是直接修改通用 `fs.ts#writeYamlFile`，是为了让无引号时间规则只作用于 OpenSpec metadata，避免未来普通 YAML 写入无意继承该格式约定。

### 2. 继续使用 `CORE_SCHEMA`，不引入自定义 js-yaml type

创建路径已经使用 `CORE_SCHEMA` 并有“不输出单引号”的回归测试。复用同一 schema 能用最小改动统一三条路径，不需要维护自定义 timestamp resolver 或 representer。

备选方案是只替换 `status` 文本行。它能最大限度保留原始格式，但会引入顶层字段识别、换行风格和重复 key 处理，并超出本次“统一 js-yaml 序列化规则”的目标，因此不采用。

### 3. 测试同时验证语义保留和原始文本表示

Create 继续覆盖覆盖/补充 `created` 的场景；Apply fixture 增加无引号 `created` 和额外 metadata，调用 `loadApplyState` 后断言 `status: applying`、无引号 `created` 与额外字段；Archive 保留现有 confirmed archive 测试并明确断言不存在带单引号的 `created`。这样可以防止仅用 `load()` 做语义断言而遗漏序列化回归。

## Risks / Trade-offs

- [风险] `CORE_SCHEMA` 对 `yes` 等字符串的 quoting 判断不同于默认 schema，未知扩展 metadata 的文本表示可能改变。→ 将 util 限定为 `.openspec.yaml`，并通过额外字段测试确认值不丢失；这与创建路径现有规则一致。
- [风险] `load()` 后整文档 `dump()` 仍会丢失注释和原始排版。→ 本次只承诺统一时间标量表示；若未来需要无损编辑，应单独引入 CST/AST 或定点文本更新方案。
- [风险] Main Apply workflow 仍使用默认 `dump()`。→ 这是用户明确排除的范围；本 proposal 只保证通过 `fyllo-specs` MCP 生命周期执行的三条路径一致。
