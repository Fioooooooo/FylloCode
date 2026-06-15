# guidelines-auto-evolve 规范

## Purpose

定义 OpenSpec 生成 tasks 时对仓库 guidelines 演进的提示规则，确保行为、架构、测试、工作流或约定变更会评估是否需要同步更新 guidelines。

## Requirements

### Requirement: openspec/config.yaml 注入 guidelines 演进规则

`openspec/config.yaml` 的 `rules.tasks` 字段 SHALL 包含一条规则，要求 agent 在生成 tasks.md 时评估本次 change 是否需要新增或修改 guidelines 文件，若有则在 tasks 中加入对应 task，明确指出要修改哪个文件、修改什么内容。

#### Scenario: tasks 生成时包含 guidelines 评估规则

- **WHEN** agent 通过 `mcp__fyllo_specs__create-proposal` 生成 tasks.md
- **THEN** agent 收到的 prompt 包含 guidelines 评估指令
- **AND** 若本次 change 影响项目约定，tasks.md 中出现对应的 guidelines 更新 task
