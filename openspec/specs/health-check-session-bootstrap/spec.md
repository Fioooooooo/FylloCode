# health-check-session-bootstrap 规范

## Purpose

定义项目健康检查入口自动创建会话、结构化 system-reminder、三类十维评分规则，以及评估到改进 proposal 的闭环输出契约。

## Requirements

### Requirement: 健康检查 session 自动发起

系统 SHALL 在用户确认健康检查后，自动执行以下步骤：

1. 调用 `sessionStore.createSession` 创建新 chat session（title 为"项目健康检查"）
2. 导航到该 session 的 chat 页面
3. 向该 session 发送两条消息：
   - 第一条（system-reminder）：`role: "user"`，内容为包裹在 `<system-reminder>` 标签内的健康检查指令；前端 UI SHALL 隐藏此消息（复用现有 system-reminder 隐藏逻辑）
   - 第二条（用户消息）：`role: "user"`，内容为"帮我根据当前项目技术栈检查：静态约束、测试约束、流程约束的配置情况并完善"

#### Scenario: 用户确认后自动创建 session 并发送消息

- **WHEN** 用户在健康度 Popover 中点击"开始健康检查"
- **THEN** 系统创建新 chat session，title 为"项目健康检查"
- **AND** 系统导航到该 session 的 chat 页面
- **AND** 系统依次发送 system-reminder 消息和用户口吻消息

#### Scenario: system-reminder 消息在 UI 中隐藏

- **WHEN** 健康检查 session 的消息列表渲染
- **THEN** system-reminder 消息（`<system-reminder>` 标签内容）在 UI 中不可见
- **AND** 用户口吻消息正常显示

### Requirement: system-reminder 必须采用结构化分块

system-reminder 文本 SHALL 由前端在发起 session 时基于固定模板渲染，模板 SHALL 包含且仅包含以下 4 个一级分块，顺序固定：

1. `## 你的角色` —— 锚定本次 session 的目的（评估 + 改进项目对 agent 的工程硬约束完备度）
2. `## 评分规范` —— 完整 10 维度表（详见下一 Requirement）+ 防刷分原则
3. `## 工作流` —— 评估 → 用户对齐 → create-proposal → apply 写入 healthScore
4. `## proposal 输出契约` —— tasks.md 必含项 + healthScore 写入方式 + changeName 命名规则

模板 SHALL 在渲染时注入 2 个动态字段：

- 当前项目根目录绝对路径（来源：`projectStore.currentProject.path`）
- 当前项目 `meta.json` 绝对路径（来源：`projectStore.currentProject.metaPath`）

#### Scenario: reminder 包含全部 4 个分块

- **WHEN** 前端渲染 system-reminder
- **THEN** 文本依次包含 `## 你的角色`、`## 评分规范`、`## 工作流`、`## proposal 输出契约` 四个一级标题
- **AND** 各分块顺序固定，不可省略

#### Scenario: reminder 注入项目路径与 metaPath

- **WHEN** 前端渲染 system-reminder
- **THEN** 文本中出现当前项目根目录绝对路径
- **AND** 文本中出现当前项目 `meta.json` 绝对路径

### Requirement: 评分规范固定为三类十维度

system-reminder 中的"评分规范"分块 SHALL 完整列出以下评分公式与维度，agent SHALL 据此评估并报告分数。每个维度的判定 SHALL 不止于"配置存在"，而 SHALL 评估"是否达到该生态广泛认可的工程最佳实践基线"。

```
healthScore = 静态约束(40) + 测试约束(30) + 流程约束(30)

静态约束（40 分，4 维各 10 分）：
- 类型检查 strict：项目语言若有类型系统，开启该语言的严格类型检查模式，且未通过大量豁免（如批量 // @ts-ignore、tsconfig 中 strict 子项被关闭、mypy 大段 ignore_missing_imports 等）削弱
- Linter 规则达到生态推荐基线：启用了该生态认可的 recommended 规则集（如 eslint:recommended、ruff 默认规则集、clippy::pedantic 等），而非仅 1–2 条最低规则
- Formatter 已配置且使用社区主流配置：使用主流默认或合理覆盖，避免空配置文件 / 全部禁用规则
- 启用语义或类型感知规则：Linter 跑了需要类型或 AST 信息才能跑的规则集（如 typescript-eslint type-checked、mypy strict_optional、clippy 类型相关 lint 集）

测试约束（30 分，3 维各 10 分）：
- Test runner 已配置：使用该生态主流测试框架，不是自制脚本或仅 echo
- Test 命令真实运行测试套件且失败会以非 0 退出：命令真正调用 runner 跑测试，断言失败会传播为命令失败；不接受 echo ok && exit 0、|| true、continue-on-error 等屏蔽手段
- Coverage 阈值合理：coverage 工具配置了 fail-under 阈值且阈值非 0（仅生成报告或阈值为 0 不算）

流程约束（30 分，3 维各 10 分）：
- Git hooks 工具已配置且真实安装：hook 工具实际 install（husky install / lefthook install / pre-commit install 等），不是仅在 package.json 列出依赖
- pre-commit hook 真实触发检查命令：hook 脚本调用了 lint / typecheck / format / test 中至少一项的真实命令，调用方式不会被静默吞掉（不是 echo、不是 exit 0、不是被注释或 || true）
- CI 配置真实运行 lint + test 且失败阻断：CI 配置文件存在；job 在主分支推送或 PR 时触发，命令失败时 job 以失败状态终止（不接受 continue-on-error: true / 全局 || true / always-succeed 脚本）
```

reminder SHALL 同时声明以下防刷分判定原则：

1. **配置存在 ≠ 得分**：必须达到该工具的工程最佳实践基线，不是最低限度的合规外形
2. **不限定工具与语言**：维度问的是"能力是否实现"，工具由 agent 根据项目栈自行映射
3. **拿不准就不给分**：agent 无法明确判定时该维度按 0 计
4. **下列反面示例 SHALL 自动判 0 分**，无论其他配置如何：
   - test 命令为 `echo ok && exit 0` 之类的桩命令
   - linter 配置仅 1–2 条规则且未 extends 任何 recommended 规则集
   - hook 脚本仅 `echo` 或 `exit 0` 或被整体注释
   - CI job 使用 `|| true`、`continue-on-error: true`、捕获失败但仍以 0 退出的脚本
   - coverage 阈值设为 0 或近乎 0（如 1%）
   - tsconfig `strict: true` 但 `noImplicitAny`、`strictNullChecks` 等子项被显式关闭
5. **每个维度的得分 SHALL 附判定理由与所引用的配置片段**（文件路径 + 关键行），不允许只输出分数

#### Scenario: 维度数与权重严格对应

- **WHEN** 前端渲染 system-reminder
- **THEN** 评分规范分块严格列出 4 + 3 + 3 共 10 个维度
- **AND** 各类满分为 40 / 30 / 30，单维满分为 10
- **AND** 包含全部 5 条防刷分原则
- **AND** 反面示例至少包含 test / linter / hook / CI / coverage / tsconfig strict 子项 6 类

#### Scenario: agent 输出维度评分时附判定理由

- **WHEN** agent 完成评估并输出各维度得分
- **THEN** 每个维度的输出包含判定理由
- **AND** 包含所引用的配置文件路径与关键行片段

### Requirement: 健康检查必须形成"评估 + 改进"闭环

system-reminder 的"工作流"分块 SHALL 要求 agent 完成以下闭环动作，agent SHALL NOT 只产出分数后停止：

1. 按 10 维度逐项判定，给出当前分数 X 与各维度状态
2. 对未达标维度提出具体可执行的改进建议（指明工具、命令、文件位置）
3. 与用户在 chat 中对齐改进范围，得到用户认可后再调用 `mcp__fyllo_specs__create-proposal`
4. proposal 的 changeName SHALL 以 `health-check-` 开头
5. proposal apply 完成后，目标分数 Y SHALL ≥ X
6. 即使当前已满分（X = 100），仍 SHALL 创建 proposal，proposal 中只保留写入 healthScore 的任务

#### Scenario: 未达标维度必须出现在改进建议中

- **WHEN** agent 完成评估并输出分数 X
- **AND** 至少有一个维度未达 10 分
- **THEN** 后续 chat 中包含针对该维度的具体改进建议（涉及具体工具、命令或文件位置）

#### Scenario: 满分项目仍走 proposal 流程

- **WHEN** 评估结果为 100 分
- **THEN** agent 仍调用 `create-proposal`
- **AND** 生成的 tasks.md 仅包含写入 healthScore 的收尾任务

### Requirement: proposal 输出契约约束 tasks.md 形态

system-reminder 的"proposal 输出契约"分块 SHALL 要求 agent 在 proposal 的 `tasks.md` 中：

1. 为每个未达标维度生成对应的配置改进任务（一条任务 = 一个维度），任务文本 SHALL 指明要修改的文件路径与目标配置
2. 在 tasks.md 末尾追加一条收尾任务，文本格式 SHALL 为：
   > 编辑 `<MetaJsonPath>`，将 JSON 中的 `healthScore` 字段更新为 `Y`，保持其他字段不变。
   > 其中 `<MetaJsonPath>` 由前端在 reminder 渲染时注入为绝对路径，`Y` 为预期目标分数。
3. healthScore 写入 SHALL 通过 Edit/Write 文件工具完成，agent SHALL NOT 假设可调用任何 IPC 通道

#### Scenario: tasks.md 收尾任务编辑指定绝对路径

- **WHEN** agent 创建 proposal
- **THEN** tasks.md 末尾包含一条任务，明确指向 reminder 中注入的 `meta.json` 绝对路径
- **AND** 任务说明使用"编辑文件"措辞，不使用"调用 IPC"措辞

#### Scenario: 每个未达标维度对应一条改进任务

- **WHEN** 评估结果中存在 N 个未达 10 分的维度（N ≥ 1）
- **THEN** tasks.md 中存在 N 条改进任务（除收尾任务外）
- **AND** 每条改进任务对应唯一一个未达标维度
