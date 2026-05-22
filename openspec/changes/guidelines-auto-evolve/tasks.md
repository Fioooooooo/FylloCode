## 1. openspec/config.yaml 扩展

- [ ] 1.1 修改 `openspec/config.yaml`：在 `rules` 下新增 `tasks` 字段，内容为：
  ```
  - 评估本次 change 是否需要新增或修改 guidelines 文件（guidelines/*.md）。若有，在 tasks 中加入对应 task，明确指出要修改哪个文件、修改什么内容。
  ```

## 2. archive.txt 补充 guidelines 触发条件

- [ ] 2.1 修改 `electron/main/services/chat/system-reminder/templates/archive.txt`：在 `## Project Guidelines` 段落的 guidelines 检查条目中，补充具体触发条件列表，使其明确列出：命令变更（commands）、架构变更（architecture）、测试变更（tests）、流程变更（workflow）、数据契约变更（data contracts）、项目约定变更（project conventions）

## 3. 验证

- [ ] 3.1 确认 `openspec/config.yaml` 语法正确（YAML 格式无误）
- [ ] 3.2 确认 `archive.txt` 修改后仍满足 `system-reminder-injection` spec 中 `archive reminder routes final guideline check` 场景的要求
