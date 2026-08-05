---
sidebar:
  group: 产品功能
  order: 40
---

# 对话与执行

对话页面承载项目上下文中的 Agent 协作，是主线上 Chat 阶段的落点。Agent 在这里分析需求、检索代码佐证、引导团队权衡取舍，与你一起收敛出决策，再继续推动 Proposal 和 Apply & Archive 阶段。

## 主要能力

- 管理 Workspace 内的会话列表
- 将重要会话置顶到独立分组，重启后仍保持置顶状态
- 独立折叠“置顶会话”和“最近会话”分组，并在多个展开分组之间平分可用高度
- 选择已安装的 ACP Agent
- 通过单一菜单查看和修改 Agent 提供的 Session 配置
- 在 Chat header 查看固定的 Session scope，区分当前 Workspace、快照外成员和 stale 成员
- 发送文本和附件上下文
- 展示 Agent 的思考、工具调用、子 Agent 调用和流式输出状态
- 支持 Mermaid、Markdown 等结构化内容展示
- 在所有 Markdown 阅读区域内安全预览 Agent 提供的绝对本地文件链接
- 在任务上下文中推进 proposal 创建和后续阶段
- 从任务发起的会话显示来源任务横幅，重新进入会话仍可见
- Agent 可通过 [fyllo-action](/docs/reference/fyllo-action) 提议创建任务、提交 plan 审阅、标记或复核 knowledge，由你确认后由 FylloCode 接管执行
- Agent 可通过 [Fyllo Signal](/docs/reference/fyllo-signal) 显示无需确认的轻量信息；Signal 不进入会话事件栏

## 管理会话分组

“置顶会话”和“最近会话”按最近活动时间分别排序。每个非空分组都可以独立折叠；两个分组同时展开时会平分标题之外的剩余高度，并在各自列表内滚动。折叠不会中断后台执行，重新展开会恢复原来的滚动位置。分组状态只保留到当前 Chat 侧栏卸载，不会写入会话元数据。

## 调整 Session 配置

Agent 提供 Session 配置时，输入框下方只显示一个配置按钮。按钮优先以“model · thought level”的形式显示当前选值；如果只提供其中一项，则只显示该项。两者都不存在时，按钮显示 `Config`。没有可见配置时，按钮不会出现。

打开菜单后，select 配置通过子菜单展示选项，boolean 配置通过一级 checkbox 直接切换。菜单保持 Agent 提供的配置顺序；修改配置后，FylloCode 使用 Agent 返回的完整配置快照刷新摘要、当前值和可用选项，因此 model 变化带来的 thought level 调整会同步显示。

## 定位历史消息

本次会话存在至少两条 user prompt 时，对话区左上角会出现悬浮时间线。2–10 条 prompt 各对应一个导览刻度；更多 prompt 固定使用 10 个刻度，但整条时间线仍连续映射到完整历史。独立的 teal thumb 跟随当前阅读位置，时间线不会因对话变长而持续增高或占用消息列宽度。

悬停或使用方向键时，摘要浮层最多显示当前 prompt 附近五条摘要。点击时间线或按 Enter 会固定完整 prompt 列表；列表独立滚动，点击任一摘要即可定位对应消息。拖动或滚动滚轮可以逐条快速定位，Home 和 End 跳到首尾，Escape 关闭摘要浮层。少于两条 prompt 时时间线不显示。

## 阅读 Agent 执行过程

正在生成的 assistant 消息会在已有内容之后显示运行状态指示，包含通用状态文案和自然单位耗时。该状态只表示当前回复仍在处理，不会根据工具调用推断 Agent 正在做的具体动作；流结束、失败或取消后指示会移除，历史消息不会保留这段运行时状态。

连续的 Thinking 和普通工具调用会收拢为一个可折叠的 Activity group。展开 group 后，可以分别查看每个 Thinking、Tool 的完整 Input 和 Output；长内容会在详情区域内滚动，不会为了布局截断底层内容。

当 Claude Code 通过 Agent 工具启动子 Agent 时，父调用会渲染为独立卡片。打开详情后，可以查看 prompt、状态、模型、token、耗时、工具统计、子工具活动和最终回复。详情只连接同一条 assistant 消息内可安全确认的父子工具关系；无法关联的工具仍按普通工具展示。

## Session scope

创建多根 ACP Session 时，FylloCode 会固定当时的 Workspace 成员快照。具备额外目录能力的 Agent 可以同时访问授权的多个 Project；Workspace 后续增删或移动成员不会改变已经运行的 Session。Chat header 的 scope popover 会列出每个 Project、路径和主 Project 标识，并在当前 Workspace 与 Session 快照不一致时显示提醒。关于多根 Workspace 要解决的问题和授权边界，见[多根 Workspace](/docs/features/multi-root-workspace)。

## 预览本地文件

Agent 输出的 Markdown 链接如果指向 POSIX、Windows drive 或 UNC 绝对路径，点击后会在窗口级 Slideover 中打开只读预览。当前 Session 快照中各 Project 的根目录和已注册 worktree 内的文件可直接读取；指向这些可信根之外的文件时，FylloCode 会在读取内容前显示完整规范路径、大小和修改时间，并要求选择“仅打开一次”或“打开并在此窗口中信任”。

预览只接受不超过 5 MiB 的 UTF-8 普通文本文件，不支持目录、设备、二进制或无效 UTF-8 文件。链接末尾可使用 `:line[:column]` 定位源码；预览允许搜索、选择和复制，但不提供保存或回写。窗口信任只保存在当前 Renderer Window 的内存中，关闭窗口或重启应用后会失效。

所有文本文件都可以在“内容溢出”和“自动换行”之间切换。识别为 Markdown 的文件还会显示“原文”和“预览”模式；“预览”使用共享 MarkStream 渲染当前只读快照。关闭 Slideover 后，这些查看选择不会保留。

## Fyllo Signal

Fyllo Signal 是 Agent 在 assistant 正文中输出的被动展示标记。当前 `show.time` 类型会把时间标签显示为非交互 pill；它不需要确认，不创建 Action 状态，不进入会话事件栏，也不改变待处理数量。历史 Signal 只从已保存的 assistant 文本重新渲染，详细协议见 [Fyllo Signal 参考](/docs/reference/fyllo-signal)。

## 会话事件栏

对话区右侧是可折叠的会话事件栏，收纳三类不会打断当前讨论、但需要留意的信息：

- **Agent 待办**：Agent 在本次会话中给出的执行项列表
- **Proposal 卡片**：本次会话中创建的 proposal 及其实时状态
- **fyllo-action 待处理项**：`knowledge.flag`、`knowledge.review` 等 rail 类型 action 的只读摘要和定位入口；确认操作仍在对话正文的内联卡片中完成

<figure class="fc-doc-image">
  <img src="/assets/screenshots/chat-rail.png" alt="会话事件栏截图" />
</figure>

事件栏可以随时折叠为窄条，展开状态会在会话间保持。

## 与 lineage 的关系

从任务发起的会话会自动绑定到该任务的 [lineage 脉络](/docs/guide/lineage)；直接发起的会话会创建一条 chat 起源的脉络，之后可以补建任务回到主线。会话中通过 `fyllo-specs` 创建的 proposal 也会自动记录到同一条脉络上，无需手动关联。

## 工作方式

普通 Agent 会话通常只有当前代码和本次 prompt。FylloCode 会把项目规范、历史决策、任务上下文和 guidelines 组织成 Agent 可读取的背景，让 Agent 在更明确的边界内工作。

对话页面负责把聊天结果送入可治理流程：当问题收敛、决策确定后，应该生成 Proposal；Proposal 通过后进入 Apply & Archive，把实现与变更记录沉淀下来。
