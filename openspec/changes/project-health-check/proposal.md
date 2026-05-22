## Why

FylloCode 打开用户项目时，无法感知该项目的代码约束健康度（静态分析、测试、流程钩子是否配置完善）。用户缺乏主动发起健康检查的入口，导致代码约束长期停留在"文档建议"层面，无法升级为可执行的强约束。

## What Changes

- `meta.json` 新增 `healthScore` 字段（number，默认 0），记录项目健康度分值
- AppHeader 中央区域的 ProjectSelector 旁新增健康度 icon，圆形边框，颜色随 `healthScore` 变化
- 点击健康度 icon 弹出 Popover，提示用户发起健康检查
- 用户确认后，FylloCode 自动打开新 chat session，预置两条消息：
  1. system-reminder（前端隐藏展示）：健康度评分公式 + 要求创建 `health-check-{projectName}` proposal + 要求在 tasks 中包含写入 `meta.json` healthScore 的任务
  2. 用户口吻消息：「帮我根据当前项目技术栈检查：静态约束、测试约束、流程约束的配置情况并完善」
- agent 走标准 chat → proposal → apply → archive 流程，apply 阶段写入 `meta.json` 的 `healthScore`
- FylloCode 监听 `meta.json` 变化，更新健康度 icon 颜色

## Capabilities

### New Capabilities

- `project-health-check-ui`：AppHeader 健康度 icon 的展示与交互逻辑，包括颜色映射、Popover 确认、新 session 启动
- `health-check-session-bootstrap`：自动发起健康检查 chat session 的消息预置逻辑（system-reminder 内容 + 用户消息格式）

### Modified Capabilities

- `project-store-persistence`：`meta.json` 新增 `healthScore` 字段，`ProjectInfo` 类型扩展
- `app-header-layout`：中央区域 ProjectSelector 旁新增健康度 icon 元素，右侧布局规则不变

## Impact

- `electron/main/services/project/` — `ProjectInfo` 类型、`meta.json` schema 扩展
- `frontend/src/components/AppHeader.vue` — 健康度 icon、Popover 组件、新 session 启动逻辑
- `electron/main/services/chat/system-reminder/chat.txt` — 无需修改，健康检查的 system-reminder 由前端在发起新 session 时动态注入，不走常规 system-reminder-injection 路径
- 无新增 IPC 通道，复用现有 `project:update` 写入 `healthScore`
