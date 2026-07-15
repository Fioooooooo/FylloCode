# 更新日志

本文件记录 FylloCode 的重要版本变更。

格式参考 Keep a Changelog，并结合当前项目阶段做了简化调整。

## [0.14.1] - 2026-07-15

这个版本让 FylloCode 可以同时承载多个项目窗口，并补齐项目级 durable knowledge 从发现、沉淀、审阅到浏览清理的完整路径。Fyllo Action 的状态持久化、执行幂等性和 Markdown 识别边界也得到系统性加固；底层跨进程结构迁移到 domain-first 架构，为后续能力扩展建立更清晰的所有权边界。

### 新增

- 新增一项目一窗口模型与无项目 launcher：重复打开同一项目会聚焦已有窗口，从项目窗口打开其他项目不会替换当前上下文，并分别保存 launcher 与各项目窗口的位置和最大化状态
- 新增项目级 durable knowledge 工作流：Agent 可通过 `knowledge.flag` 标记高价值信息，由用户触发批量 capture，再通过 `knowledge.review` 审阅和编辑写入 app data 的 knowledge 文档
- `fyllo-cortex` 新增 `knowledge` 工具，提供 `capture`、`update`、`retire`、`audit` 四种模式，并通过 file、package、URL anchor 将知识状态计算为 `active`、`suspect` 或 `unknown`
- Overview 新增「知识沉淀」治理入口与独立 `/knowledge` 浏览页，支持按 project、reference、feedback 分组阅读完整 Markdown、查看状态和扫描异常，并在二次确认后删除单条知识
- Fyllo Action 新增可持久化的 `ready` 状态、权威注册与命令式状态迁移，以及会话待处理数量 badge；应用重启后仍可恢复未处理 Action
- 新增 `.nvmrc` 与 worktree 环境准备脚本，统一 Node 版本并按锁文件校验或安装依赖

### 调整

- 项目跨进程与模块结构迁移到 `platform`、`workspace`、`session`、`proposal`、`insight`、`automation` 六领域：preload API 使用 `window.api.<domain>.<area>`，IPC channel 使用 `<domain>:<area>:<action>`，并以 lint 约束 main service、renderer store 与 feature 的依赖方向
- Fyllo Action 的 shared contract、main service 与 renderer feature 重新分层；Action 注册、状态迁移和副作用幂等性由主进程统一校验，任务创建和批量 knowledge flag 处理不会因状态同步重试而重复执行副作用
- Fyllo Action 的 inline 渲染、EventRail 和 action identity 现在共享同一套源码分析；只有独占顶层 Markdown block 的完整标签可执行，inline code、代码块、列表、引用和解释文本中的示例保持普通 Markdown
- 多窗口运行时按项目隔离 Chat probe、Proposal status watcher 与流式取消；ACP agent 等应用级事件则广播到所有活跃窗口
- renderer feature 边界改由通用 ESLint 规则约束，并补充架构、注释、测试和工作区环境相关项目准则与文档
- `fyllo-specs archive-change` 现在要求归档新增 capability 后补全生成 spec 的 `## Purpose`，仍有占位内容时不得宣告归档完成

### 修复

- 修复 Fyllo Action 在应用重启后丢失待处理状态、非法状态迁移覆盖权威状态，以及重试时可能重复创建业务对象的问题
- 修复 Action 标签出现在 inline code、代码示例、列表、引用、普通说明或未闭合流式片段时被误识别，导致正文被吞掉、错误注册或 EventRail 与 inline 状态不一致的问题
- 修复多项目同时运行时相同 `sessionId`、`changeId`、`runId` 或 agent key 可能互相覆盖、串发事件或误取消的问题
- 修复 knowledge review 自动保存失败或组件卸载时可能丢失编辑，以及异常 knowledge 文件被静默隐藏的问题

### 备注

- 应用版本升级到 `0.14.1`。
- `fyllo-cortex` MCP server 升级到 `0.5.0`，新增完整的 durable knowledge 工具与状态审计能力。
- `fyllo-specs` MCP server 升级到 `0.8.1`，新增归档后 capability spec Purpose 占位检查要求。
- **兼容性提示**：preload API root 与 IPC channel 已迁移到 domain-first 形状。依赖旧 `window.api.<area>` 或旧 channel 名称的自定义集成需要改用 `window.api.<domain>.<area>` 与 `<domain>:<area>:<action>`；本地持久化路径和数据格式保持兼容。

## [0.14.0] - 2026-07-07

这个正式版本将 0.14 beta 周期中的 Plan 工作流、项目准则治理和治理视图优化收束为稳定发布。Chat 现在可以在直接实现、Plan 和 Proposal 之间更清晰地分流，Overview、Proposal、Task 与准则浏览页也形成了更完整的项目治理入口。内置 MCP server 同步升级，`fyllo-specs` 补齐 linked worktree 场景下的探索与归档指引，`fyllo-cortex` 的 guidelines 工具则专注于准则维护。

### 新增

- 新增 session-scoped Plan 工作流：Agent 可创建轻量 plan，用户可在应用内审阅、编辑、保存和批准，批准记录会进入 lineage，并通过 `plan.create` Fyllo action 串联回当前 Chat session
- 新增 `/guidelines` 只读项目准则浏览页，可从 Overview 的「项目准则」统计卡进入，按 `guidelines/**/*.md` 递归展示准则列表、frontmatter 元数据、正文、空状态和错误状态
- Chat 新增用户 prompt 时间线、消息复制按钮、发送时间展示和会话侧栏折叠，让长会话定位、复制与阅读更稳定
- 任务看板新增任务关联会话入口，可从任务卡查看并打开相关 Chat session；本地任务也新增更明确的关闭任务快捷操作
- Proposal、Overview 和 Chat EventRail 统一展示 linked worktree indicator，并在 hover/focus 时展示对应 worktree 路径
- 新增 `project-health`、`guidelines-browser`、`local-task-actions`、`task-linked-conversations`、`proposal-browser`、`fyllo-specs-explore` 等 OpenSpec 能力规约，用于沉淀本轮治理与工作流行为契约

### 调整

- Chat system reminder 改为直接实现、Plan、Proposal 三级分流，并在 Chat 与 Apply 阶段自动注入项目 `guidelines/**/*.md` 索引，减少 Agent 修改前重复发现准则的成本
- Overview 改为更清晰的动态/静态双区结构，进行中提案、最近脉络、治理健康、规约增长和准则演化的层级更明确
- `/proposal` 页面简化为完整 proposal 列表入口，移除重复的顶部统计、状态 tabs 和本地筛选，同时保留详情 Slideover
- 本地任务操作从“卡片直接删除”调整为“卡片关闭任务、详情编辑弹窗中删除任务”，降低日常收尾时误删任务的风险
- `fyllo-specs` 的 `create-plan`、`create-proposal`、`apply-change`、`archive-change` 指引进一步收敛，要求按用户语言反馈进度、在 Plan 批准后重读文件，并把准则维护任务写得更具体
- `fyllo-specs explore` 现在能发现 main workspace 和 registered linked worktree 中的 active change，并在 state 中返回 workspace metadata 和非致命 warning
- `fyllo-specs create-proposal` 现在为新 OpenSpec change 写入准确的 ISO `created` 时间戳；`archive-change` 的提交信息指引改为强调 proposal 的实际交付内容，而不是归档动作本身
- `fyllo-cortex` guidelines 工具从 `read`/`write` 改为 `init`/`create`/`update` 三种维护模式，并返回场景化 `<tool_instruction>` 与当前 `<state>`
- 项目自身的 guidelines、OpenSpec baseline、README 与文档站内容进行了同步整理，覆盖 Overview、Plan/SDD 工作流、Loop Engineering 和 MCP server 参考资料

### 修复

- 修复 Proposal 详情关闭后 Chat EventRail proposal 状态可能不同步的问题
- 修复 Proposal 详情 header 无法区分实现完成待归档、归档中和基础状态的问题，并修复重新打开后元数据可能显示旧任务数量、状态或日期的问题
- 修复 Proposal workflow 菜单可能溢出 Slideover，以及 Proposal overlay 层级低于任务来源横幅的问题
- 修复 Proposal 归档按钮在 run meta 不属于当前 proposal 或正在归档时仍可能展示为可用的问题
- 修复 `fyllo-cortex` guidelines 扫描在单个文件读取失败、UTF-8 BOM frontmatter 或缺少 `FYLLO_PROJECT_PATH` 时的降级与回退问题
- 修复 shell tooltip hover 配置影响范围过宽的问题，并修复若干 Chat 布局、全局 overlay、prompt timeline 与归档状态显示细节

### 备注

- 应用版本升级到 `0.14.0`。
- `fyllo-specs` MCP server 升级到 `0.8.0`，覆盖 Plan tool、worktree-aware explore、准确 change 创建时间、create-proposal 准则任务规则和 archive commit 指引。
- `fyllo-cortex` MCP server 升级到 `0.4.0`。这是 breaking change：`guidelines` 的 `read`/`write` 模式已移除，调用方需要改用 `init`、`create` 或 `update`。
- 本地 lineage session link 新增 `plans` 字段。既有数据会按空数组读取，不需要手动迁移。

## [0.14.0-beta.2] - 2026-07-02

这个 beta 版本继续收敛 Agent 工作流的提示契约和项目准则治理。Chat 与 Apply 阶段现在会自动注入项目 `guidelines/**/*.md` 索引，让 Agent 在修改前读取相关准则，而 `fyllo-cortex` 的 guidelines 工具改为专注维护准则。与此同时，本版本优化了 Plan、Proposal、健康检查和 Fyllo action 的提示边界，并补齐若干 Chat 与 Proposal 细节，让直接实现、Plan、Proposal、Apply 与 Archive 的衔接更明确。

### 新增

- Chat 与 Apply system reminder 新增 `<guidelines>` 项目准则索引注入；索引来自当前项目或 Apply worktree 的 `guidelines/**/*.md` frontmatter，并会转义尖括号避免用户文档提前闭合提示块
- 新增共享的 guidelines 扫描入口，主进程提示注入与 `fyllo-cortex` MCP server 的 guidelines 状态读取复用同一套扫描逻辑
- 健康检查 reminder 新增项目准则检查项：缺少、损坏或过期的准则会引导 Agent 通过 `fyllo-cortex` guidelines 工具直接维护，而不是进入 Proposal 流程
- Slash Command 菜单新增基于命令描述和 hint 的搜索与 hover 详情展示；配置项下拉菜单也会在 hover 时展示选项描述
- Proposal 详情新增更细的展示状态：实现完成后显示“可归档”，归档过程中显示“归档中”，避免仅用 applying 状态掩盖下一步动作

### 调整

- `fyllo-cortex` guidelines 工具从 `read`/`write` 改为 `init`/`create`/`update` 三种维护模式，并返回场景化 `<tool_instruction>` 与当前 `<state>`
- `fyllo-cortex` guidelines 作者契约改为模块化 instruction：frontmatter 与质量规则作为硬要求，正文结构改为 rules、map、playbook 三种默认骨架
- Chat 与 Apply system reminder 改为使用 reminder 注入的准则索引，Archive reminder 则明确在归档前通过 `fyllo-cortex` 维护准则；Agent 不再需要为了读取索引而重复调用工具
- Plan 创建、Proposal 创建、Apply 与 Archive 的 MCP instruction 进一步收敛：要求按用户语言反馈进度，Plan 审阅后重新读取最新文件，并引导用户通过 FylloCode 的 Apply Change 入口继续
- 健康检查 reminder 改为先写入当前 `healthScore`，再按需维护项目准则；只有评分维度需要工程配置改进或 project-health 规约缺失/过期时才创建 Proposal
- ACP session plan 事件在共享类型和 UI 命名中统一改为 agenda，Chat 事件轨组件与测试随之更新
- 文档站和 README 刷新了 `fyllo-cortex`、Overview、Plan/SDD 工作流与 Loop Engineering 相关内容，并补齐中英文页面
- 项目自身的历史 OpenSpec 与 guidelines 资料被清理，用于验证现有项目从空准则/空规约状态接入时的体验

### 修复

- 修复 Proposal 归档按钮在 run meta 不属于当前 proposal 或正在归档时仍可能展示为可用的问题
- 修复 Proposal 详情 header 只显示基础状态，无法区分实现完成待归档与归档中的问题
- 修复 `fyllo-cortex` guidelines 扫描在读取单个文件失败时可能导致整个扫描失败的问题；现在会在对应条目上返回 `parseError`
- 修复 `fyllo-cortex` guidelines frontmatter 含 UTF-8 BOM 时解析不稳定的问题
- 修复 `fyllo-cortex` lineage 与 guidelines 在缺少 `FYLLO_PROJECT_PATH` 时无法一致回退到当前工作目录的问题
- 修复 Chat 布局、全局 overlay 样式、prompt timeline 视觉与 Proposal 归档状态显示的若干细节问题

### 备注

- `fyllo-cortex` MCP server 升级到 `0.4.0`。这是 breaking change：`guidelines` 的 `read`/`write` 模式已移除，调用方需要改用 `init`、`create` 或 `update`。
- `fyllo-specs` MCP server 升级到 `0.6.1`，主要更新 Plan、Proposal、Apply 与 Archive 的 Agent instruction，不新增 tool。

## [0.14.0-beta.1] - 2026-06-30

这个 beta 版本引入 session-scoped Plan 工作流，用于承接不改变外部契约、但需要调研和方案取舍的复杂任务。Chat 现在可以生成、审阅、编辑并批准轻量计划，批准记录会进入 lineage，并通过新的 `fyllo-specs` MCP tool 与 Fyllo action 串联。与此同时，Chat 阅读体验补齐了 prompt 时间线、消息复制和会话侧栏折叠，Proposal 详情也会在打开时刷新元数据，减少旧状态干扰。

### 新增

- 新增 session-scoped Plan 工作流：Agent 可通过 `fyllo-specs` 的 `create-plan` 在当前 Chat session 下创建轻量 plan 文档，并由 `plan.create` Fyllo action 触发应用内审阅
- 新增 Plan Slideover，支持读取、编辑、保存和批准 plan；用户批准后会自动发送确认消息，要求 Agent 重新读取最新 plan 后再实施
- 新增 plan 读写与批准 IPC、preload API、renderer API、共享 schema 与主进程 plan service；plan 路径由主进程按项目、session 和 slug 推导，renderer 不接收本地路径
- lineage session link 新增 plans 记录，MCP `create-plan` 事件会被消费并挂接到当前 session；历史 lineage 数据缺少 plans 时会兼容读取为空数组
- Chat 新增用户 prompt 时间线，可在长会话中快速定位多轮用户输入，并在 hover/focus 时预览 prompt 内容
- Chat 消息新增复制按钮与发送时间展示，复制时会排除 system reminder 内容，并在没有可复制文本或复制失败时给出应用内反馈
- Chat 左侧 session sidebar 新增折叠/展开交互，折叠状态仅保存在当前 `/chat` 页面内存中
- 新增 `openspec/specs/plan-tool` 能力规约，并同步扩展 Fyllo action、lineage、system reminder 和 bundled MCP server 相关规约

### 调整

- Chat system reminder 改为直接实现、Plan、Proposal 三级分流：低风险任务可直接做，非契约复杂任务走 Plan，涉及外部行为契约或边界变更时仍走 Proposal
- Chat 事件轨和 prompt 时间线共享消息滚动容器，事件轨始终保持挂载并按当前会话内容展示可用事件
- Fyllo action handler 结果从简单成功/失败扩展为 `succeeded`、`failed`、`cancelled`、`dismissed`，关闭 Plan 审阅但未批准时不会写入成功状态
- `fyllo-specs` MCP server 的 instruction markdown 从四个扩展为五个，新增 `create-plan.md`，并更新 tool 列表、prompt 加载和测试覆盖
- `fyllo-cortex` lineage 输出中的 session 信息现在包含关联 plans，方便追溯某次会话中的轻量决策记录
- Proposal 详情 Slideover 每次打开都会后台刷新 proposal 元数据，header 可先展示已有数据，并在刷新期间显示 loading 状态
- Chat 主区域增加顶部 fade mask 和布局细节调整，配合 prompt 时间线降低长会话扫描成本

### 修复

- 修复 Proposal 详情重新打开后任务数量、状态或日期可能仍显示旧元数据的问题
- 修复 Proposal 详情元数据刷新失败时 header 可能丢失已有信息的问题；刷新失败时会继续保留打开前的可用元数据
- 修复 Proposal overlay 层级低于任务来源横幅，导致详情面板可能被横幅遮挡的问题
- 修复 shell 控件 tooltip hover 配置影响范围过宽的问题，现在相关选项仅作用于 shell 控件

### 备注

- `fyllo-specs` MCP server 升级到 `0.6.0`，新增 `create-plan` tool；`fyllo-cortex` MCP server 升级到 `0.3.1`，lineage session 输出新增 plans。
- 本地 lineage session link 新增 `plans` 字段。既有数据会按空数组读取，不需要手动迁移。

## [0.13.3] - 2026-06-29

这个补丁版本继续强化项目治理的阅读与回溯体验。Overview 现在可以下钻到只读能力规约浏览页，Proposal 详情改为在当前上下文中打开的 Slideover，并新增 Specs 变更视图，方便直接查看 proposal 对能力规约的影响。Chat 侧进一步降低工具调用噪音，优化会话标题操作，并修复重启后历史 proposal 关联可能丢失的问题。

### 新增

- 新增 `/specs` 只读能力规约浏览页，可从 Overview 的「能力规约」统计卡进入，按 capability 展示 `openspec/specs/*/spec.md` 中的 Purpose、Requirement、Scenario、源路径、更新时间和统计数量
- 能力规约详情新增 Requirement 快速定位栏与 Scenario timeline 展示，正文继续使用项目统一 Markdown 渲染能力
- Proposal 详情新增 Specs tab，展示 proposal 中 `specs/<capability>/spec.md` 的 capability delta，并用新增、修改、移除、重命名 badge 区分变更类型
- 新增受控的 specs browser 与 proposal specs delta IPC、preload API、renderer store 和共享 DTO，为只读规约浏览与 proposal delta 展示提供稳定边界
- Chat assistant 消息支持将连续工具调用折叠为可展开工具组，并基于 `toolMetadata.toolKind` 展示读写、编辑、搜索、执行等概况和图标
- 新生成的 assistant tool part 会保留 ACP 工具类别 metadata；历史消息缺少该字段时仍可折叠，并降级显示为通用工具运行概况

### 调整

- Proposal 详情从独立路由改为右侧 Slideover，从 proposal 列表、Overview 进行中变更和 Chat EventRail 打开时不再离开当前页面上下文
- Proposal 详情 Slideover 保留 Proposal/Design/Tasks 阅读、开始实现、归档、运行历史和 applying 自动恢复能力，并在归档后自动切换到 archived proposal id 继续读取详情
- Proposal 列表路由收敛为顶层 `/proposal` 页面，移除仅承载子路由的空壳页面
- Chat 会话条目的更多菜单中，“重命名”改为“修改标题”，并改为在条目内就地编辑标题
- Chat 会话删除改为使用应用内确认弹窗，替代浏览器原生确认框
- Chat 会话条目的更多按钮不再长期占用标题右侧空间，正常浏览列表时可显示更长的会话标题
- Overview 的能力规约统计卡改为可点击入口；项目准则和溯源覆盖统计仍保持纯展示
- 文档站新增中英文博客文章《Using Plan and SDD to Triage Agent Workflows》，并补齐 Google 站点验证与 gtag 配置

### 修复

- 修复重启或重新进入 session 后，Chat EventRail 可能无法从 lineage 回填历史 proposal 的问题
- 修复已归档 proposal 因目录名包含日期前缀而无法匹配 lineage 原始 changeId，导致会话 proposal 面板不显示的问题
- 修复已归档 proposal 回填后仍尝试启动 proposal 状态监听的问题；现在仅对非终态 proposal 启动 watch
- 修复 Chat 推理内容、工具调用和普通文本交错时的部分展示细节，并补齐连续工具调用分组后的 Fyllo action partIndex 稳定性

### 备注

- `/proposal/:id` 独立详情路由已移除；请通过 `/proposal` 列表、Overview 进行中变更或 Chat EventRail 的详情入口打开 Proposal 详情 Slideover。

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
