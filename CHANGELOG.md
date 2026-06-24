# 更新日志

本文件记录 FylloCode 的重要版本变更。

格式参考 Keep a Changelog，并结合当前项目阶段做了简化调整。

## [0.13.2] - 2026-06-24

这个补丁版本继续把 Chat 打造成项目治理的操作入口。会话事件轨现在可以直接展示当前会话关联的 proposal，并跟随 OpenSpec 状态变化实时更新；用户也可以从 Chat 中开始实现、查看详情或在实现完成后归档 proposal。文档站补齐了中英文结构、博客入口和站点地图，同时项目许可证切换为 MIT，降低外部使用和贡献门槛。

### 新增

- Chat 会话事件轨新增“会话提案”面板，展示当前 session 关联的 proposal、状态 badge 和详情入口
- 支持从 Chat 事件轨直接选择 workflow 开始实现 draft proposal，并在 apply 完成后提供归档入口
- 主进程新增 proposal 状态监听与 `proposal:statusChanged` 推送，覆盖 main worktree 与 `.worktrees/*` 中的 active/archive 目录变化
- Chat 事件轨新增待处理 Fyllo action 列表，用户可从事件项定位回原始 action card
- Chat session 列表新增关联任务图标与 hover popover，按需展示任务来源和 lineage 中保存的任务标题
- 文档站新增英文站点结构、博客索引、ACP Agent 分层与 lineage 设计文章，并生成 sitemap 配置
- 新增共享 `UiSurface` 组件与 renderer UI 设计规范，为卡片、页面层级、颜色和文案提供统一约束

### 调整

- 统一 Chat 执行计划面板与会话提案面板的 header、折叠行为、间距和中文标题
- 优化 Chat 主区域在事件轨显示时的可伸缩宽度，让消息列、错误提示和输入区保持同列对齐
- Activity Bar 改为图标优先的窄导航，使用 tooltip 展示名称，并统一选中态与 hover 反馈
- App Header 调整为更轻量的窗口框架样式，中央项目切换器改为 pill 形态并对齐 macOS 标题栏约束
- 全局 tooltip 配置收敛到 `UApp`，统一 hover 延迟和键盘焦点行为
- 将项目许可证从 AGPL-3.0 切换为 MIT，并同步更新 `package.json`、README 与贡献文档中的许可证说明
- 升级 `@nuxt/ui` 到 4.9.0，并配置 Nuxt UI root 以适配 `.nuxt-ui` override 目录位置

### 修复

- 修复新 proposal 状态推送早于 proposal store 加载时，Chat 事件轨可能只能显示 raw change id 的问题
- 修复 Chat proposal 卡片中长 change id 可能挤压状态 badge 的布局问题
- 修复 creating 状态 proposal 仍可能显示不可用操作入口的问题
- 修复任务绑定 session 首次创建后，来源任务信息需要重新加载 session 列表才会显示的问题

## [0.13.1] - 2026-06-17

这个补丁版本继续收敛项目治理与 Chat 体验，同时提升 ACP Agent 的扩展性与主进程稳定性。你现在可以通过自定义 Agent 配置文件接入更多 ACP Agent；Chat 的执行计划面板被整合到会话事件轨，Overview 则进一步把 proposal 导航、归档提交线索和活跃变更标题聚合到统一视图。主进程架构也完成了重要整理，使存储、进程通信和错误处理更加稳定可靠。

### 新增

- 支持通过 `custom-agents.json` 配置自定义 ACP Agent，扩展第三方或内部 Agent 的接入方式
- Chat 新增会话事件轨，把 ACP 执行计划面板整合到会话事件时间线，保持输入区简洁并强化执行进度的可读性
- fyllo-cortex MCP server 新增 lineage 工具，支持按 trace-file 模式追踪需求线索并返回 proposal 路径
- Overview 新增归档提交线索展示，需求 proposal 的 archive commit hash 现在会被持久化并呈现在 lineage 视图中
- 自定义 Agent 编辑器将保存按钮置顶，方便长表单一键保存

### 调整

- Proposal 导航入口从独立页面迁移到 Overview，减少项目空间的跳转成本
- Chat 进入页面时自动清空已失效的活跃会话状态，避免旧状态干扰新对话
- 隐藏 Chat 音频输入按钮，直到相关能力准备就绪
- fyllo-skills MCP server 重命名为 fyllo-cortex，与项目文档和概念模型保持一致
- Overview 统计栏网格布局优化，在较小窗口下也能保持信息密度
- ACP 流式事件解析统一为共享驱动，减少主进程、preload 与渲染层之间的重复映射
- 主进程错误构建统一收敛到 ipcError，Agent 相关错误码由单一事件映射函数维护
- IO 密集型模块从 domain 层下沉到 infra 层，配合事件总线广播与 ID 工厂规范对齐主进程分层

### 修复

- 修复 overview 与 lineage 中 proposalStatus 推导逻辑不一致的问题
- 修复 ACP 二进制归档解压可能受到的 zip slip 路径遍历风险
- 限制外部导航只允许 http/https 协议，防止非预期 scheme 跳转
- 修复主进程在窗口销毁后仍向已关闭窗口广播以及重启定时器未取消的问题
- 修复 integration 与 window-state 存储写入非原子化可能导致的数据损坏
- 强化存储解析、启动流程与日志脱敏，提升异常输入与日志安全边界
- 修复 Overview 活跃变更标题的格式化问题

## [0.13.0] - 2026-06-12

这个版本把 FylloCode 推进为更可追溯的项目治理。新的 Overview 页面成为项目默认入口，集中展示项目治理、进行中变更、近期讨论和基于 lineage 的指标。Chat、Task 与 Proposal 现在通过持久化 lineage 模型串联；Chat 也可以渲染并持久化由 Agent 输出、经用户确认后执行的 Fyllo action。同时，本版本补齐了公开文档站，恢复了多会话并行流式输出，并提升了不同 ACP Agent 的工具调用展示兼容性。

### 新增

- 新增接入真实主进程数据的项目 Overview 页面，将 OpenSpec 数量、guideline 活动、git 趋势、进行中变更、近期 lineage 线索和治理指标聚合到项目默认视图
- 新增项目 lineage 模型与持久化能力，用于追踪一条需求线索在任务、聊天会话和 proposal 之间的流转，并包含 lineage IPC、任务来源会话关联、来自 `fyllo-specs create-proposal` 的 proposal 关联，以及 Overview 所需的近期线索投影
- 从任务发起的 Chat 会话新增来源任务横幅，重新进入对话后仍可看到该会话对应的任务来源
- Chat 新增 `<fyllo-action>` 渲染与状态持久化，首个支持的 `task.create` action 可让 Agent 以结构化输出提议创建本地任务，同时由 FylloCode 控制校验、确认和最终执行
- 直接在 Chat 中讨论并创建 proposal 的开放会话，现在可通过本地任务创建流程补齐来源任务，并把任务绑定回同一个 lineage subject
- 新增 VitePress 文档站，包含产品指南、功能参考、截图、ACP Agent 文档、`fyllo-specs` 与 `fyllo-cortex` 参考资料，以及文档构建/预览脚本

### 调整

- 项目入口现在默认打开 Overview，让项目治理状态和当前工作进展成为进入项目后的第一屏
- Chat 中过长的用户文本消息现在默认折叠，并提供展开/收起控制，减少粘贴日志、规格和长 prompt 时对对话可扫描性的影响
- 统一主进程、preload 与渲染层之间的 ACP 流式事件契约，减少重复映射，并更稳定地保留工具调用中的 input、content、diff、locations 与 terminal 等字段
- Chat system reminder 现在会注入 Fyllo action 契约和 lineage 上下文；对于绑定任务的会话，会注入任务标题，但仍避免注入完整任务描述
- 仓库源码目录迁移到 `src/`，测试迁移到顶层 `test/` 镜像结构，并同步刷新项目 guideline、README 与贡献文档
- 新增 commit message hook 校验，并扩展 lint-staged 对 ESM/CJS/TS/Vue 文件的覆盖
- 刷新运行时和开发依赖，包括 ACP SDK、AI SDK、Nuxt UI、Vue 工具链、VitePress 及相关 lockfile 更新

### 修复

- 恢复 Chat 多会话并行流式输出，切换会话不再丢失其他运行中会话的 chunk、状态、标题或 usage 更新
- 修复并发流式输出时 Chat MessagePort 交接可能错绑的问题，现在每条 stream 都通过独立 `streamId` 关联
- 修复 ACP Agent 运行时启动逻辑，`npx`、`uvx` 和 binary 分发现在会正确读取 registry 中声明的启动 `args` 与 `env`
- 修复消息渲染中使用 `content-visibility` 导致的 Chat 滚动偏移问题
- 改进工具调用卡片对不同 Agent 的兼容性，覆盖先收到 update、不同阶段携带 input/diff、以及 completed 状态附带错误输出等情况
- 修复源码目录迁移后 `fyllo-specs` 共享类型依赖解析问题，使 bundled server 能重新纳入 lint 和 type-aware 检查

### 备注

- 本地 task 与 session metadata 新增 lineage 和 action-state 相关字段。既有数据仍可读取，不需要手动迁移。

## [0.12.1] - 2026-06-06

这个补丁版本修复 codex-acp 权限请求处理中的紧急问题。此前自动选择 `allow_always` 时，codex-acp 只会按已批准的命令前缀匹配请求，未批准的命令会直接返回 `user abort` 并导致执行中断；现在改为选择 `allow_once`，让当前授权请求可以按一次性允许继续执行。

### 修复

- 修复 ACP Agent 权限请求自动处理时选择 `allow_always` 会触发 codex-acp 已批准前缀匹配限制的问题，避免未批准命令直接返回 `user abort` 导致无法执行

## [0.12.0] - 2026-06-04

这个版本聚焦 Chat 体验收敛、会话执行进度可见性，以及版本信息补齐。设置页 About 面板现在可以直接检查 GitHub 正式 Release 是否有新版本；Chat 也新增了内联的 ACP 执行计划面板、消息加载骨架屏，并进一步优化了 Markdown 渲染开销。同时，Agent 在 probe 阶段返回的可用命令会被捕获并沿会话保存；对于被取消或异常中断的流式回复，应用现在会保留已生成的部分助手内容，而不是直接丢失。

### 新增

- 设置页 About 面板新增 GitHub 正式 Release 检测能力，可检查是否有新版本，并直接跳转到对应的 Release 页面
- Chat 会话新增内联 ACP 执行计划展示，在会话进行中可在输入框上方查看当前计划进度、条目状态与优先级
- 聊天会话新增对 Agent 可用命令列表的捕获与保存，为草稿态和正式会话中的 Slash Commands 提供稳定的数据基础
- 聊天历史加载阶段新增骨架屏，减少消息加载过程中的空白等待感
- 新增共享的确认弹窗组件与 `useConfirmDialog()` composable，统一渲染层确认交互的调用方式

### 调整

- 优化聊天消息中的 Markdown 渲染开销，提升长消息与流式输出场景下的界面性能
- 统一设置页、任务卡片、Agent 卡片等多处操作的确认弹窗交互模式，减少不同区域之间的体验差异
- Slash Commands 的命令数据改为按会话维度维护与回显，切换会话时状态更一致

### 修复

- 修复流式聊天在用户停止生成或回复因错误中断时，助手已生成的部分内容可能丢失的问题
- 修复回复被取消或异常提前结束后，部分助手消息未被持久化、重新进入会话后内容消失的问题
- 修复 Chat 中仍可能显示 `mode` 类配置项的问题；在相关权限控制尚未具备前，这些不安全暴露的控件现已隐藏

## [0.11.3] - 2026-06-01

这个补丁版本聚焦本地 JSON 持久化模型的收敛与迁移能力补齐。应用启动时会自动执行数据迁移，既有持久化字段命名与时间格式得到统一，避免历史数据长期积累格式分叉；同时修复了使用同一 Agent 开启新草稿会话时配置项栏可能不显示的问题。

### 新增

- 新增本地 JSON 数据迁移框架，在应用启动阶段按版本顺序执行迁移，并提供 baseline 机制避免新安装重复回放历史迁移
- 新增首批持久化数据迁移脚本，用于将历史数据中的 `config_options` 字段迁移为 `configOptions`，并把若干缓存与安装记录中的时间戳统一迁移为 ISO 8601 字符串

### 调整

- 统一持久化 JSON 文件中的字段命名约定，收敛为 camelCase
- 统一 ACP 注册表缓存、安装状态缓存和已安装记录中的时间字段格式，改为 ISO 8601 字符串，减少跨模块读写格式分歧
- 调整迁移脚本注册结构，集中到独立脚本目录与静态注册表，便于后续扩展和维护
- 修正运行时依赖分类，将 `@nuxt/ui` 归入生产依赖，避免组件库被误归类为仅开发时依赖

### 修复

- 修复使用与上一个草稿会话相同的 Agent 重新创建新草稿时，配置项探测不会重新触发，导致配置栏可能为空的问题
- 修复数据迁移 runner 相关测试，提升迁移链路在回归验证时的稳定性
- 修复图标构建脚本中的无效 warning 输出

## [0.11.2] - 2026-06-01

这个补丁版本聚焦 ACP Agent 管理体验优化。现在可以在应用内卸载已安装 Agent，Agent 列表会展示更明确的类型信息，Chat 空态下的 Agent 选择布局也更稳定；同时，Agent 安装状态检测明显提速，减少设置页与选择面板的等待感。

### 新增

- 新增 ACP Agent 卸载流程，支持在设置页对已安装 Agent 进行确认后卸载，并按不同安装方式执行对应的卸载命令
- 新增 ACP Agent 类型分类，在注册表缓存、设置页卡片和 Chat 空态卡片中展示 Agent 的类别信息，帮助区分不同来源与定位
- 新增 Agent 安装状态缓存与后台刷新机制，应用可先展示最近一次检测结果，再异步更新最新状态

### 调整

- Agent 安装状态检测改为按分发类型批量探测，显著减少逐个 Agent 检测带来的耗时
- Chat 空态中，当已安装 Agent 少于 4 个时，Agent 选择卡片会自动居中，避免少量卡片偏左堆积
- ACP Agent 卡片统一为共享展示骨架，卸载入口收纳进更多菜单，已安装态与选中态改为右上角角标展示
- Agent 卡片的外链信息调整为优先展示 `website` 与 `repository`，并移除已安装态中的“最新版本”提示

### 修复

- 修复少量已安装 Agent 场景下，Chat 空态“更多 Agent”卡片可能拉伸或布局不均衡的问题
- 修复卸载成功后本地安装记录与能力缓存未及时清理可能导致的残留状态问题
- 修复卸载流程在底层命令静默失败时可能误判为成功的问题，卸载完成后会重新校验实际安装状态

## [0.11.1] - 2026-05-28

这个补丁版本延续 Chat 配置项体验，修复空态样式问题，并收紧仓库质量检查规则。

### 新增

- Chat 创建 session 时支持携带草稿 probe 的配置项，避免配置栏在首次会话交接时出现空白状态
- 新增仓库质量约束 spec，明确 type-aware lint 与覆盖率阈值要求

### 调整

- 强化 ESLint type-aware 检查，并扩展生成类型文件的忽略规则
- 调整 Vitest 超时配置，提升涉及 git 子进程测试在慢速环境下的稳定性

### 修复

- 修复 Chat 空态 `MoreAgentsTile` 的样式问题
- 修复 IPC 边界传递配置项时 reactive proxy 可能导致 structured clone 失败的问题

## [0.11.0] - 2026-05-27

这个版本围绕 Chat 首次会话体验和 ACP 配置能力做了一次功能升级。Chat 现在可以在会话级别展示并设置 Agent 暴露的配置项；同时将 Agent 选择前置到 Chat 空态，补齐桌面发版 workflow，并修复若干会话标题与内置 MCP 稳定性问题。

### 新增

- 新增 ACP session 级 config options 的端到端支持，Chat prompt 可展示、修改并随消息提交 agent 暴露的配置项
- 新增草稿态 session probe，在首条消息发送前预先获取当前 agent 的配置项能力，避免必须先创建正式会话才能配置参数
- Chat 空态新增 Agent 选择体验，展示已安装 agent，并提供更多 agent 的选择弹窗
- 新增 GitHub Actions 桌面发布 workflow，支持通过版本 tag 触发 GitHub draft release 与多平台安装包上传

### 调整

- Activity Bar 默认入口调整为 Chat，进入项目后优先呈现对话工作流
- Chat prompt 底部移除原有 Agent 下拉选择，将 agent 选择职责收敛到空态与会话状态中
- Chat 配置项读取逻辑区分正式 session 与草稿 probe，避免未就绪或失败状态下渲染过期配置
- 发布流程增加 tag 版本与 `package.json` 版本一致性校验，降低误发版风险

### 修复

- 修复 fallback session title 生成时可能把 system reminder 纳入标题内容的问题
- 修复 `fyllo-specs` 在非英文系统 locale 下解析 git 子进程输出可能不稳定的问题

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

这个版本是在 `0.9.0` 稳定基线之上，对内置 MCP 工作流层做的一次明显扩展。它新增了 `fyllo-cortex` bundled server，继续增强了 `fyllo-specs` 在 OpenSpec 初始化与 archive 收尾阶段的自动化能力，并修复了首条消息 setup 阶段可见的 chat 停止状态问题。

### 新增

- 新增 bundled `fyllo-cortex` MCP server，提供面向仓库 guideline 编写流程的 `guidelines` tool
- `fyllo-cortex` 的 `guidelines` 新增 read mode，可扫描 `guidelines/**/*.md` 并返回本地 guideline 元数据，供 agent 读取当前项目规范覆盖情况
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
