## Why

agent 在每次 chat/apply/archive 阶段完成工作后，不会主动评估本次变更是否需要新增或修改 guidelines。guidelines 的演进依赖用户显式发起，导致文档规则长期滞后于项目实际约定。

## What Changes

- `openspec/config.yaml` 新增 `rules.tasks` 条目，注入一条引导规则：agent 在生成 tasks.md 时，评估本次 change 是否需要新增或修改 guidelines，若有则在 tasks 中加入对应 task
- apply system-reminder 模板（`apply.txt`）补充引导：agent 在执行 tasks 时，若发现现有 guidelines 缺失或与代码事实不符，作为当前 change 的一部分同步更新
- archive system-reminder 模板（`archive.txt`）补充引导：agent 在归档前，检查本次 change 是否涉及命令、架构、测试、流程、数据契约或项目约定的变更，若有则确认对应 guidelines 已更新

## Capabilities

### New Capabilities

无新能力，所有变更均为现有机制的配置/模板扩展。

### Modified Capabilities

- `system-reminder-injection`：`apply.txt` 和 `archive.txt` 模板补充 guidelines 演进引导内容（已有 guidelines 路由语义，本次加强措辞使其成为明确要求而非建议）

## Impact

- `openspec/config.yaml` — 新增 `rules.tasks` 条目
- `electron/main/services/chat/system-reminder/apply.txt` — 补充 guidelines 演进引导
- `electron/main/services/chat/system-reminder/archive.txt` — 补充 guidelines 归档前检查引导
- 不引入新文件类型、不修改 IPC、不修改任何 TypeScript 类型
