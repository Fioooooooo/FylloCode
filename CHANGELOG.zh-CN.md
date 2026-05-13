# 更新日志

本文件记录 FylloCode 的重要版本变更。

格式参考 Keep a Changelog，并结合当前项目阶段做了简化调整。

## [0.9.0] - 2026-05-13

这是第一版结构化维护的预发布版本。FylloCode 已经从初始脚手架阶段进入可用于 MVP 验证的产品阶段，核心能力已经覆盖 proposal、task、chat、workflow 和 agent integration 等主要流程。

### 新增

- Proposal 的 Apply 与 Archive 流程，以及按 stage 执行的运行机制
- Task 面板、本地任务 CRUD、任务聊天桥接与任务详情弹窗
- Agent Chat 会话管理与上下文使用量展示
- ACP reasoning chunks、slash commands、停止能力与更完善的 prompt 交互体验
- 新 ACP session 的 system reminder 注入能力，包括持久化与前端过滤展示
- 内置 `fyllo-specs` MCP server，支持 proposal、apply-change、archive-change 与 explore 工作流
- Workflow 编辑能力与内置 workflow 模板

### 调整

- Integration 能力重构为以 provider 连接和项目级资源挂载为中心的模型
- Activity Bar、欢迎页流程与导航结构围绕当前产品布局做了收敛
- ACP agent 进程生命周期与退出治理加强，提升桌面环境稳定性
- 打包产物与 bundled resources 的路径处理进一步统一

### 修复

- 打包后 unpacked MCP server 的路径解析问题
- macOS ARM64 构建致命错误与 Fyllo 图标加载异常
- Chat 与 Proposal 执行流之间的 streaming pipeline 一致性问题
- reminder 持久化与 apply-change fixture 相关测试断言问题

### 备注

- `0.9.0` 标志着项目开始正式维护 changelog
- `1.0.0` 将保留给 MVP 跑通且核心产品契约趋于稳定的阶段
