## MODIFIED Requirements

### Requirement: create-proposal tool 返回 state

`create-proposal` tool SHALL 接收参数 `{ changeName: string, targetPath: string, workspaceMode?: "linked" | "main", includeInstruction?: boolean }`。`targetPath` 必填且 SHALL 表示主仓库路径；校验规则参见「所有 tool 入参必填 targetPath 并校验合法性」Requirement。`workspaceMode` 省略时 SHALL 默认为 `"linked"`，且仅影响本次调用，不持久化为项目级偏好。

tool SHALL 在执行 OpenSpec 创建前解析本次工作区：

- 当 `workspaceMode === "main"` 时，`workspace.path === path.resolve(input.targetPath)`，tool SHALL NOT 创建 linked worktree。
- 当 `workspaceMode === "linked"` 且 `targetPath` 是 git 项目时，tool SHALL 创建或复用 `<targetPath>/.worktrees/<changeName>` 作为 git linked worktree，并将 `workspace.path` 设为该绝对路径。
- 当 `workspaceMode === "linked"` 但 `targetPath` 不是 git 项目时，tool SHALL fallback 到 main workspace，返回 `workspace.mode === "main"` 与 `workspace.path === path.resolve(input.targetPath)`，并在 state warnings 中说明 non-git fallback。

tool 内部 projectRoot SHALL 取自 `workspace.path`，并在该路径下调用 `runtime-openspec#createChange(projectRoot, changeName)`。`runtime-openspec#createChange` SHALL 在执行 OpenSpec CLI `new change` 前确保该 `projectRoot` 已完成最小 OpenSpec 初始化，然后创建目录并写入初始 `.openspec.yaml { schema, status: "creating" }`。

在所有 required artifacts 完成后，`create-proposal` prompt SHALL 继续要求 agent 将同一 change 的 `.openspec.yaml` `status` 显式写回 `draft`，然后才结束创建工作流。

返回 state 至少包含：

| 字段            | 类型                                                                | 说明                                                     |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `changeName`    | string                                                              | 当前目标 change                                          |
| `workspace`     | `{ mode: "linked" \| "main"; path: string }`                        | 本次 change artifacts 后续应读写的工作目录               |
| `schemaName`    | string                                                              | 如 `spec-driven`                                         |
| `applyRequires` | `string[]`                                                          | schema 定义的 apply 前置 artifacts                       |
| `artifacts`     | `{ id, status, outputPath, dependencies, template, instruction }[]` | 每个 artifact 的当前状态与创建所需的模板与指令           |
| `nextArtifact`  | string \| null                                                      | 下一个应被创建的 artifact id                             |
| `warnings`      | `string[]`                                                          | 非阻塞说明，例如 non-git fallback 或已存在 worktree 复用 |

#### Scenario: linked 模式创建 worktree 并返回 workspace

- **WHEN** 调用 `create-proposal` 传入不存在的 `changeName`、合法 git 项目 `targetPath`、且 `workspaceMode` 省略
- **THEN** tool 创建 `<targetPath>/.worktrees/<changeName>` linked worktree
- **AND** 在 `<targetPath>/.worktrees/<changeName>/openspec/changes/<changeName>/` 创建 OpenSpec change
- **AND** 返回 `state.workspace.mode === "linked"`
- **AND** 返回 `state.workspace.path === path.resolve(<targetPath>/.worktrees/<changeName>)`
- **AND** 返回 state 中 `changeName === <changeName>`

#### Scenario: main 模式直接在主仓库创建 proposal

- **WHEN** 调用 `create-proposal` 传入不存在的 `changeName`、合法 `targetPath`、且 `workspaceMode: "main"`
- **THEN** tool 不调用 `git worktree add`
- **AND** 在 `<targetPath>/openspec/changes/<changeName>/` 创建 OpenSpec change
- **AND** 返回 `state.workspace.mode === "main"`
- **AND** 返回 `state.workspace.path === path.resolve(<targetPath>)`

#### Scenario: agent 使用 workspace.path 填写 artifacts

- **WHEN** `create-proposal` 返回 state
- **THEN** tool instruction SHALL 指示 agent 在 `state.workspace.path` 下读取和修改 proposal artifacts
- **AND** 当 `workspace.path` 存在时，instruction SHALL NOT 让 agent 从 `targetPath` 自行推导 artifact 路径

#### Scenario: creation workflow finalizes to draft

- **WHEN** agent 完成所有 required artifacts
- **THEN** prompt SHALL 要求写回同一 change 的 `.openspec.yaml`，将 `status` 设置为 `draft`
- **AND** 创建工作流仅在该写回完成后结束

#### Scenario: non-git linked fallback

- **WHEN** 调用 `create-proposal` 传入 non-git 项目 `targetPath` 且 `workspaceMode` 省略
- **THEN** tool 不尝试创建 linked worktree
- **AND** 返回 `state.workspace.mode === "main"`
- **AND** 返回 `state.workspace.path === path.resolve(targetPath)`
- **AND** `state.warnings` 包含 non-git fallback 说明

#### Scenario: create-proposal initializes missing OpenSpec project structure

- **WHEN** 调用 `create-proposal` 传入合法 `targetPath`
- **AND** 解析出的 `workspace.path` 下缺少 `openspec/changes/archive/`、`openspec/specs/` 或 `openspec/config.yaml`
- **THEN** `runtime-openspec#createChange` 在调用 OpenSpec CLI `new change` 前创建缺失的 `openspec/changes/archive/` 目录
- **AND** 创建缺失的 `openspec/specs/` 目录
- **AND** 当 `openspec/config.yaml` 缺失时写入默认 `schema: spec-driven` 配置模板，且模板的 `rules.tasks` 数组中包含默认的 guidelines-evaluation 英文规则
- **AND** 随后继续创建 `<workspace.path>/openspec/changes/<changeName>/`
- **AND** tool 返回正常 `create-proposal` state

#### Scenario: existing OpenSpec config is preserved

- **WHEN** 调用 `create-proposal` 传入合法 `targetPath`
- **AND** 解析出的 `workspace.path` 下已存在 `openspec/config.yaml`
- **AND** 文件文本中已包含默认 guidelines-evaluation 英文规则字面量
- **THEN** `runtime-openspec#createChange` SHALL NOT 覆盖或改写该文件内容
- **AND** 仍然创建缺失的 `openspec/changes/archive/` 与 `openspec/specs/` 目录
- **AND** 随后继续创建 `<workspace.path>/openspec/changes/<changeName>/`

#### Scenario: existing OpenSpec config is augmented with default guidelines rule

- **WHEN** 调用 `create-proposal` 传入合法 `targetPath`
- **AND** 解析出的 `workspace.path` 下已存在 `openspec/config.yaml`
- **AND** 文件文本中不包含默认 guidelines-evaluation 英文规则字面量
- **THEN** `runtime-openspec#createChange` SHALL 解析该文件，将默认规则字符串追加到 `rules.tasks` 数组（必要时创建 `rules` 与 `rules.tasks` 字段）
- **AND** SHALL 保留原文件中的其他 `rules` 条目、其他顶层字段（如 `schema`、`context`）
- **AND** SHALL 在 spawn OpenSpec CLI 前完成回写
- **AND** 仍然创建缺失的 `openspec/changes/archive/` 与 `openspec/specs/` 目录
- **AND** 随后继续创建 `<workspace.path>/openspec/changes/<changeName>/`

### Requirement: runtime-openspec 适配层封装 CLI spawn

系统 SHALL 在 `mcp-servers/fyllo-specs/src/runtime-openspec/` 提供适配层，负责所有与 `@fission-ai/openspec` 的交互。适配层 SHALL 通过 spawn `@fission-ai/openspec` 随应用分发的 CLI（`bin/openspec.js`）并解析 `--json` stdout 实现 openspec 相关语义，SHALL 不以 `import`/`require` 形式引用 `@fission-ai/openspec` 的任何模块（因该包的 `package.json#exports` 未开放子路径；`dist/core/*` 属于内部实现不稳定）。

适配层对 tool 层暴露且仅暴露以下 5 个函数：

- `listChanges(projectRoot: string)`
- `computeStatus(projectRoot: string, changeName: string)`
- `getInstructions(projectRoot: string, changeName: string, artifactId: string)`
- `createChange(projectRoot: string, name: string)`
- `archiveChange(projectRoot: string, name: string, opts: { confirm?: boolean })`

`createChange(projectRoot, name)` SHALL 在 spawn OpenSpec CLI 前执行最小 OpenSpec 项目初始化检查。该检查 SHALL 确保：

- `<projectRoot>/openspec/changes/archive/` 存在；
- `<projectRoot>/openspec/specs/` 存在；
- `<projectRoot>/openspec/config.yaml` 存在；若不存在，写入默认 `schema: spec-driven` 配置模板，且该模板的 `rules.tasks` 数组中默认包含一条引导 agent 在生成 tasks.md 时评估本次 change 是否需要新增或修改 guidelines 文件的英文规则；若已存在，则在文件文本中检测该默认规则字面量，若未包含则解析-合并-回写以补齐 `rules.tasks`，若已包含则保持原文件字节不变。补齐时 SHALL 保留原文件中其他 `rules` 条目与其他顶层字段。

tool 层 SHALL 不直接 spawn CLI，也 SHALL 不直接 import `@fission-ai/openspec`；所有与 openspec 相关的行为 SHALL 经由 `import ... from "../runtime-openspec"`。

#### Scenario: tool 不直接引用 openspec

- **WHEN** 在 `mcp-servers/fyllo-specs/src/tools/` 任意文件中检查 import / require
- **THEN** 不存在 `from "@fission-ai/openspec"` 或 `from "@fission-ai/openspec/*"` 的 import
- **AND** 不存在直接调用 `child_process.spawn` / `execa` 启动 `openspec` 的代码
- **AND** 所有 openspec 语义经由 `import ... from "../runtime-openspec"`

#### Scenario: 适配层不以库形式 require openspec

- **WHEN** 在 `mcp-servers/fyllo-specs/src/runtime-openspec/` 下检查文件的 import / require
- **THEN** 不存在 `import ... from "@fission-ai/openspec"` 或 `require("@fission-ai/openspec/...")`
- **AND** 存在通过 `child_process.spawn`（或等价 API）启动 `bin/openspec.js` 的代码路径

#### Scenario: createChange initializes before spawning CLI

- **WHEN** `runtime-openspec#createChange(projectRoot, name)` 被调用
- **AND** `<projectRoot>/openspec/config.yaml` 不存在
- **THEN** runtime-openspec SHALL 在 spawn OpenSpec CLI 前写入默认 `config.yaml`
- **AND** 该默认 `config.yaml` 的 `rules.tasks` 数组包含默认的 guidelines-evaluation 英文规则
- **AND** 在 spawn OpenSpec CLI 前创建 `<projectRoot>/openspec/changes/archive/`
- **AND** 在 spawn OpenSpec CLI 前创建 `<projectRoot>/openspec/specs/`
- **AND** spawn OpenSpec CLI 创建 change

#### Scenario: createChange preserves existing config when default rule already present

- **WHEN** `runtime-openspec#createChange(projectRoot, name)` 被调用
- **AND** `<projectRoot>/openspec/config.yaml` 已存在且文件文本中包含默认 guidelines-evaluation 英文规则字面量
- **THEN** runtime-openspec SHALL NOT 覆盖该文件
- **AND** SHALL 在 spawn OpenSpec CLI 前补齐缺失目录
- **AND** spawn OpenSpec CLI 创建 change

#### Scenario: createChange augments existing config when default rule missing

- **WHEN** `runtime-openspec#createChange(projectRoot, name)` 被调用
- **AND** `<projectRoot>/openspec/config.yaml` 已存在但文件文本中不包含默认 guidelines-evaluation 英文规则字面量
- **THEN** runtime-openspec SHALL 解析该文件并将默认规则字符串追加到 `rules.tasks` 数组（必要时创建 `rules` 与 `rules.tasks` 字段）
- **AND** SHALL 保留原文件中其他 `rules` 条目与其他顶层字段（如 `schema`、`context`）
- **AND** SHALL 在 spawn OpenSpec CLI 前完成回写
- **AND** 在 spawn OpenSpec CLI 前补齐缺失的 `openspec/changes/archive/` 与 `openspec/specs/` 目录
- **AND** spawn OpenSpec CLI 创建 change
