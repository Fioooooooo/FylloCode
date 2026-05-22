## ADDED Requirements

### Requirement: openspec/config.yaml 注入 guidelines 演进规则

`openspec/config.yaml` 的 `rules.tasks` 字段 SHALL 包含一条规则，要求 agent 在生成 tasks.md 时评估本次 change 是否需要新增或修改 guidelines 文件，若有则在 tasks 中加入对应 task，明确指出要修改哪个文件、修改什么内容。

#### Scenario: tasks 生成时包含 guidelines 评估规则

- **WHEN** agent 通过 `mcp__fyllo_specs__create-proposal` 生成 tasks.md
- **THEN** agent 收到的 prompt 包含 guidelines 评估指令
- **AND** 若本次 change 影响项目约定，tasks.md 中出现对应的 guidelines 更新 task

### Requirement: archive.txt 补充 guidelines 归档前检查触发条件

`archive.txt` 模板中 guidelines 检查段落 SHALL 明确列出触发条件：命令变更、架构变更、测试变更、流程变更、数据契约变更、项目约定变更。检查措辞 SHALL 为强制要求（"check whether the completed change altered..."）而非建议。

#### Scenario: archive reminder 包含具体触发条件

- **WHEN** 主进程为 archive owner 渲染 system-reminder 文本
- **THEN** 文本包含 `fyllo-skills.guidelines`
- **AND** 文本包含命令、架构、测试、流程、数据契约、项目约定等触发条件的描述
