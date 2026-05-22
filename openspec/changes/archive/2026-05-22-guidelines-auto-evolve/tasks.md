## 1. FylloCode 自身 openspec/config.yaml 扩展

- [x] 1.1 修改 `openspec/config.yaml`：在 `rules.tasks` 下加入一条规则（中文）：

  ```
  - 评估本次 change 是否需要新增或修改 guidelines 文件（guidelines/*.md）。若有，在 tasks 中加入对应 task，明确指出要修改哪个文件、修改什么内容。
  ```

## 2. MCP server 默认配置模板升级

- [x] 2.1 修改 `mcp-servers/fyllo-specs/src/runtime-openspec/create-change.ts` 中的 `DEFAULT_CONFIG_YAML`：将原本仅作示例的注释替换为实际生效的 `rules.tasks` 块，规则文本使用英文，与下条 3.1 的常量复用同一字符串：

  ```yaml
  rules:
    tasks:
      - Evaluate whether this change should add or update local repository guidelines. If so, add a task in tasks.md that names the specific guideline file and what to change.
  ```

## 3. MCP server 已存在 config.yaml 的规则补齐

- [x] 3.1 在 `create-change.ts` 顶部新增常量 `GUIDELINES_TASKS_RULE_EN`，与 `DEFAULT_CONFIG_YAML` 中的英文规则字面量保持一致；该常量同时用于检测与注入。
- [x] 3.2 扩展 `ensureOpenSpecProjectInitialized`：当 `openspec/config.yaml` 已存在时，
  - 若文件文本中已包含 `GUIDELINES_TASKS_RULE_EN` 字面量，立即返回（保留原文件字节、注释、格式）；
  - 否则用 `js-yaml` 解析为 object，确保 `rules` 是 object、`rules.tasks` 是数组，将 `GUIDELINES_TASKS_RULE_EN` push 进数组（保留其他 rules 与其他顶层字段），再 `dump` 写回。
- [x] 3.3 在 `mcp-servers/fyllo-specs/__tests__/openspec-runtime.test.ts` 增补三种情况的测试：
  - **缺失 config.yaml**：`createChange` 写出的默认模板内容包含 `GUIDELINES_TASKS_RULE_EN`；
  - **已存在但无规则**：`createChange` 后 `rules.tasks` 数组包含该规则，且原 `context` / 其他自定义字段保留；
  - **已存在且已含规则**：`createChange` 前后 `config.yaml` 的字节内容完全一致（不重写）。

## 4. 验证

- [x] 4.1 确认 `openspec/config.yaml` YAML 语法合法（pnpm typecheck 不覆盖此项；用 `node -e "require('js-yaml').load(require('fs').readFileSync('openspec/config.yaml','utf8'))"` 或 IDE 校验即可）。
- [x] 4.2 在 repo 根目录运行 `pnpm test`，3.3 新增测试通过；`pnpm typecheck` 无新增错误。
