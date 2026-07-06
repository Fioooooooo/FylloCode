## Context

`src/mcp-servers/fyllo-specs/src/tools/create-proposal.ts` 在准备 proposal workspace 后调用 `createChange(projectRoot, changeName)`。`createChange` 位于 `src/mcp-servers/fyllo-specs/src/runtime-openspec/create-change.ts`，当前流程是：

1. 确保 `openspec/` 项目结构存在。
2. 如果目标 `.openspec.yaml` 已存在则直接返回。
3. 调用内置 OpenSpec CLI 执行 `new change <name>`。
4. 读取 CLI 生成的 `.openspec.yaml`，将 `status` 改为 `creating`，再用 `js-yaml` 写回。

这个变更只调整第 4 步的 metadata 写回逻辑。项目 guideline 要求 `src/mcp-servers/fyllo-specs/src/tools/**` 不直接 spawn 或直接依赖 OpenSpec 包，因此实现应继续留在 runtime 层，不移动 tool/runtime 边界。

## Goals / Non-Goals

**Goals:**

- 在 `createChange` 首次创建 OpenSpec change 时，确保 `.openspec.yaml` 的 `created` 字段使用当前 `new Date().toISOString()`。
- 不区分已有字段和缺失字段：已有 `created` 也直接覆盖为当前 ISO 时间。
- 写回 YAML 时保持 `created` 位于 `status` 之前。
- 保留现有 `status: creating` 行为和已存在 change 时的早退行为。
- 用 main Vitest 测试覆盖缺失 `created` 与已有 `created` 两类输入。

**Non-Goals:**

- 不改变 `create-proposal` MCP tool 的输入 schema、返回 state、event 写入或 workspace 选择逻辑。
- 不改变列表、overview、lineage 等读取 proposal metadata 的展示规则。
- 不迁移历史 `.openspec.yaml` 文件。
- 不改变 OpenSpec CLI 自身输出。

## Decisions

### Decision: 在 `createChange` 内集中处理 `created` 和 `status`

`createChange` 已经负责读取并写回 `.openspec.yaml`，并且当前就是 `status` 覆盖点。将 `created` 写入放在同一个函数中，可以保证所有通过 `create-proposal` 进入的 OpenSpec change 都经过一致的 metadata 修正。

备选方案是放在 `createProposalTool` 中二次写文件，但那会让 tool 层持有 OpenSpec metadata 写回细节，削弱 runtime 层封装。

### Decision: 重建 YAML 对象以固定字段顺序

实现应先从原始 YAML 读取为 `Record<string, unknown>`，再构造新的 plain object 写回：

- 复制除 `created`、`status` 之外的原字段。
- 按顺序写入 `created: new Date().toISOString()`。
- 再写入 `status: "creating"`。

这样能让 `js-yaml.dump()` 输出 `created` 在 `status` 之前，不依赖对已有字段赋值时的插入顺序。其他未知字段仍应尽量保留，只排除会被覆盖的 `created` 和 `status`。

### Decision: 继续使用 `js-yaml`

现有代码已经用 `js-yaml` 解析和写回 `.openspec.yaml`。本变更继续使用该库，不引入新的 YAML parser，也不做字符串拼接式修改。

## Risks / Trade-offs

- 字段顺序依赖 JavaScript plain object 的插入顺序和 `js-yaml.dump()` 的默认输出。缓解：通过测试断言 `created` 行出现在 `status` 行之前。
- `new Date().toISOString()` 会受测试运行时真实时间影响。缓解：在单元测试中使用 Vitest fake timers 固定系统时间。
- CLI 未来可能生成额外顶层字段。缓解：重建对象时保留除 `created`、`status` 之外的未知字段。

## Migration Plan

无需数据迁移。变更只影响之后通过 `createChange` 新建的 `.openspec.yaml`。
