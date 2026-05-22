## ADDED Requirements

### Requirement: 健康检查 session 自动发起

系统 SHALL 在用户确认健康检查后，自动执行以下步骤：

1. 调用 `sessionStore.createSession` 创建新 chat session（title 为"项目健康检查"）
2. 导航到该 session 的 chat 页面
3. 向该 session 发送两条消息：
   - 第一条（system-reminder）：`role: "user"`，内容为包裹在 `<system-reminder>` 标签内的健康检查指令，前端 UI SHALL 隐藏此消息（复用现有 system-reminder 隐藏逻辑）
   - 第二条（用户消息）：`role: "user"`，内容为"帮我根据当前项目技术栈检查：静态约束、测试约束、流程约束的配置情况并完善"

system-reminder 内容 SHALL 包含：

- 健康度评分公式：静态约束（eslint/prettier/tsconfig 等）满分 40 分，测试约束（test runner/coverage 等）满分 30 分，流程约束（git hooks/CI 等）满分 30 分，根据实际检测到的配置按比例计算
- 要求 agent 创建 changeName 以 `health-check-` 开头的 proposal
- 要求 tasks.md 中包含"通过 `project:update` IPC 将 `healthScore` 写入当前项目 meta.json"的任务

#### Scenario: 用户确认后自动创建 session 并发送消息

- **WHEN** 用户在健康度 Popover 中点击"开始健康检查"
- **THEN** 系统创建新 chat session，title 为"项目健康检查"
- **AND** 系统导航到该 session 的 chat 页面
- **AND** 系统依次发送 system-reminder 消息和用户口吻消息

#### Scenario: system-reminder 消息在 UI 中隐藏

- **WHEN** 健康检查 session 的消息列表渲染
- **THEN** system-reminder 消息（`<system-reminder>` 标签内容）在 UI 中不可见
- **AND** 用户口吻消息正常显示
