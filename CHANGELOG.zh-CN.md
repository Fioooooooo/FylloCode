# 更新日志

本文件记录 FylloCode 的重要版本变更。

格式参考 Keep a Changelog，并结合当前项目阶段做了简化调整。

## [0.10.3] - 2026-05-26

这个补丁版本聚焦包体积、Windows 兼容性和本地调试能力。收紧了桌面打包范围，改进了跨平台子进程启动路径，并补上了用于排查 renderer 异常的开发入口。

### 新增

- 顶部导航新增 DevTools 启动入口，方便在桌面应用内快速打开开发者工具
- 新增 renderer 错误与未处理 rejection 上报链路，通过 app IPC / preload API 将前端异常传递到主进程日志

### 调整

- 打包规则改为更严格的白名单与排除策略，减少源码、工程元数据、测试、示例、文档和 sourcemap 等非运行时内容进入安装包
- Windows 安装包策略做了调整，降低安装包加载阶段的等待成本
- 外部子进程启动统一改用 `cross-spawn`，覆盖主进程、内置 MCP runtime 与脚本入口，提升跨平台命令执行稳定性
- 新增并归档桌面打包优化的 OpenSpec 记录，同时补充 Build、CodeStyle 与 MainProcess guideline 中的相关约束

### 修复

- 修复 Windows 项目路径持久化时未安全编码导致特殊路径可能无法正确恢复的问题
- 修复部分平台上直接使用 Node 原生 child process spawn 时命令解析不一致的问题

## [0.10.2] - 2026-05-26

这个补丁版本新增了项目健康检查入口，增强了 ACP 退出时的整棵进程树清理能力。

### 新增

- 新增项目健康检查，在顶部导航提供一键启动健康检查入口，引导 agent 评估静态约束、测试约束与流程约束，并通过标准 proposal 流程协助补齐缺口

### 调整

- ACP 进程退出流程改为有界关闭 session、关闭 stdin，并清理整棵进程树，确保 agent 子进程与 MCP 进程一起回收
- 主进程 disposable 单项超时时间提升到 8 秒，为 ACP 的分阶段清理流程预留时间

### 修复

- 修复应用退出后 ACP agent 派生的 MCP 子进程可能残留为孤儿进程的问题

## [0.10.1] - 2026-05-25

这个补丁版本补上了第一版端到端的多模态 Chat prompt 流程。用户现在可以在 Chat prompt 中附加文件和图片，agent 可以声明自身的 prompt 附件能力，本地图片附件也能在聊天历史中安全预览。

### 新增

- 新增 Chat prompt 的多模态附件能力，支持图片与文件附件的前端入口、展示与提交处理
- 新增 agent prompt capability 的加载与缓存，让 renderer 只在当前 agent 支持时展示对应附件入口
- 新增用于读取本地附件为 data URL 的 IPC 与 preload API，用于图片预览渲染
- 新增 Chat attachment 存储与 prompt part 工具函数，保证文件元数据能贯穿聊天流程

### 调整

- Chat prompt UI 被拆分为更小的 prompt 专属组件，包括附件卡片、附件列表、操作菜单与 slash command 菜单
- Chat 消息渲染拆分为 `components/chat/message` 下的 `ChatMessageList`、`AssistantMessage` 与 `UserMessage`
- 用户图片预览解析逻辑下沉到独立的 `useUserImagePart` composable

### 修复

- 本地 `file://` 图片附件现在通过受控的 data URL 读取路径渲染，不再依赖 renderer 直接访问本地文件
- Chat 与 Proposal 的消息列表调用点已同步使用重命名后的消息组件，适配新的 chat message 目录结构

## [0.10.0] - 2026-05-24

这个版本是在 `0.9.0` 稳定基线之上，对内置 MCP 工作流层做的一次明显扩展。它新增了 `fyllo-skills` bundled server，继续增强了 `fyllo-specs` 在 OpenSpec 初始化与 archive 收尾阶段的自动化能力，并修复了首条消息 setup 阶段可见的 chat 停止状态问题。

### 新增

- 新增 bundled `fyllo-skills` MCP server，提供面向仓库 guideline 编写流程的 `guidelines` tool
- `fyllo-skills` 的 `guidelines` 新增 read mode，可扫描 `guidelines/**/*.md` 并返回本地 guideline 元数据，供 agent 读取当前项目规范覆盖情况
- `fyllo-specs create-proposal` 新增 OpenSpec 自动初始化能力，缺少目录或默认配置时可自动补齐
- `fyllo-specs` 会在创建或复用 OpenSpec 配置时自动注入 `guidelines-evaluation` 规则

### 调整

- `fyllo-specs archive-change` 现在会在 linked worktree 合并分叉后执行结构化恢复流程，支持安全的 rebase 后重试收尾
- `fyllo-specs archive-change` 现在会先通过 stdout 成功标记确认 OpenSpec archive 真的完成，再继续后续 git cleanup
- 仓库 guideline 结构做了收敛整理，`Build` 与 `DeveloperWorkflow` 被拆分为独立主题文档

### 修复

- 修复 Chat 首条消息在 ACP setup 阶段的 stop 行为，使用户能在连接或 session 尚未完成建立时可靠取消当前提交
- 修复 archive 流在 OpenSpec 仅返回 exit 0 但未确认真正归档完成时，仍可能继续执行后续 cleanup 的问题

### 备注

- 当前仍处于提案阶段、尚未进入产品实现的 `project-health-check` change 不计入本次发布内容

## [0.9.0] - 2026-05-20

这是首个稳定的 `0.9.0` 正式版。在最初 beta 基线之上，FylloCode 进一步补全了多 worktree 编排、session list 交互收敛、内置 specs workspace 能力，以及一组面向日常使用的体验与稳定性改进。

### 新增

- Proposal 的 Apply 与 Archive 流程，以及按 stage 执行的运行机制
- Task 面板、本地任务 CRUD、任务聊天桥接与任务详情弹窗
- Agent Chat 会话管理与上下文使用量展示
- ACP reasoning chunks、slash commands、停止能力与更完善的 prompt 交互体验
- 新 ACP session 的 system reminder 注入能力，包括持久化与前端过滤展示
- 内置 `fyllo-specs` MCP server，支持 proposal、apply-change、archive-change 与 explore 工作流
- Workflow 编辑能力与内置 workflow 模板
- 多 worktree 基础能力，包括 chat orchestration、archive orchestration 与 proposal 列表的 worktree 扫描
- 设置页 About 面板，支持在应用内查看当前版本信息

### 调整

- Integration 能力重构为以 provider 连接和项目级资源挂载为中心的模型
- Activity Bar、欢迎页流程与导航结构围绕当前产品布局做了收敛
- ACP agent 进程生命周期与退出治理加强，提升桌面环境稳定性
- 打包产物与 bundled resources 的路径处理进一步统一
- 内置 `fyllo-specs` workspace 升级，以匹配最新项目工作流要求
- Session list 交互进一步收敛为以 conversation-first 为中心的模型
- Apply 与 Archive prompt 的 guardrails 收紧，`includeInstruction` 的处理更加明确
- system reminder 模板资源迁移为独立文本文件，便于维护
- 设置页导航宽度与聊天状态指示器样式做了细化调整
- 仓库开始忽略 `.worktrees`，减少本地工作区噪音

### 修复

- 打包后 unpacked MCP server 的路径解析问题
- macOS ARM64 构建致命错误与 Fyllo 图标加载异常
- Chat 与 Proposal 执行流之间的 streaming pipeline 一致性问题
- reminder 持久化与 apply-change fixture 相关测试断言问题
- `usage_update` 事件期间提交态被错误清空的问题
- 创建新 session 时 chat 状态未正确重置的问题
- 部分文档与测试 spec 不一致的问题

### 备注

- 该版本汇总了 `0.9.0-beta.1` 到 `0.9.0-beta.3` 期间的全部已发布能力，作为首个稳定 `0.9.0` 正式版对外发布
- `1.0.0` 将保留给 MVP 跑通且核心产品契约趋于稳定的阶段
