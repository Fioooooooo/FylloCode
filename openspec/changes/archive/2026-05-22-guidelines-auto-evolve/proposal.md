## Why

agent 在每次 chat/apply/archive 阶段完成工作后，不会主动评估本次变更是否需要新增或修改 guidelines。guidelines 的演进依赖用户显式发起，导致文档规则长期滞后于项目实际约定。

更进一步：FylloCode 是 OpenSpec 项目初始化器（`runtime-openspec#createChange` 在用户项目首次缺少 `openspec/config.yaml` 时会写入默认模板），所以"让 agent 在 tasks 阶段主动评估 guidelines 影响"应当成为 FylloCode 为所有 OpenSpec 项目注入的默认规则，而不是只对 FylloCode 自身生效。

## What Changes

- `openspec/config.yaml`（FylloCode 自身）新增一条 `rules.tasks` 规则（中文）：在生成 tasks.md 时评估本次 change 是否需要新增或修改 guidelines，若有则在 tasks 中加入对应 task
- `mcp-servers/fyllo-specs/src/runtime-openspec/create-change.ts` 的 `DEFAULT_CONFIG_YAML` 升级为包含同语义的英文规则的实际生效配置（不再仅是注释示例）
- `ensureOpenSpecProjectInitialized` 在 `config.yaml` 已存在但缺少该英文规则时，提前补齐 `rules.tasks`，保留其他自定义字段与其他 rules

## Capabilities

### New Capabilities

无新能力。

### Modified Capabilities

- `fyllo-specs-mcp`：`runtime-openspec#createChange` 的初始化语义从"已有 config.yaml 一字不动"放宽为"已有 config.yaml 时若缺失默认 guidelines 评估规则则补齐，其余字段不动"。

## Impact

- `openspec/config.yaml` — 新增 `rules.tasks` 条目（中文）
- `mcp-servers/fyllo-specs/src/runtime-openspec/create-change.ts` — `DEFAULT_CONFIG_YAML` 升级；新增 `GUIDELINES_TASKS_RULE_EN` 常量；扩展 `ensureOpenSpecProjectInitialized`
- `mcp-servers/fyllo-specs/__tests__/openspec-runtime.test.ts` — 新增三种 config 状态的测试
- `openspec/specs/fyllo-specs-mcp/spec.md`（archive 时同步）— MODIFIED：`existing OpenSpec config is preserved` 与 `createChange preserves existing config before spawning CLI` 两个 scenario 的 SHALL 文本调整为允许补齐默认规则
- 不引入新文件类型、不修改 IPC、不修改任何 system-reminder 模板
