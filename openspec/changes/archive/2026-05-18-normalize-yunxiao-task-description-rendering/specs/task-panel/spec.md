## MODIFIED Requirements

### Requirement: 任务面板以可滚动卡片列表渲染任务

系统 SHALL 在 `/task` 主内容区渲染垂直滚动的任务卡片列表。每张卡片 SHALL 显示任务标题、描述摘要、来源标识、创建时间和状态指示器。任务页顶部说明文案 SHALL 为“集中查看任务，并快速发起 AI 讨论。”。任务卡片中的描述摘要 SHALL 基于 `TaskItem.description` 的结构化内容提取可读纯文本，而 SHALL NOT 直接显示原始 Markdown 标记、HTML 标签或云效 RichText JSON 字符串。

#### Scenario: 任务页文案覆盖本地与第三方任务

- **WHEN** 用户导航至 `/task`
- **THEN** 页面顶部说明文案显示“集中查看任务，并快速发起 AI 讨论。”

#### Scenario: 云效来源下无可展示任务

- **WHEN** 用户切换到“云效”标签且最终没有任何可展示任务
- **THEN** 页面复用当前任务页已有的“暂无任务”空态结构
- **AND** 不区分“未挂载云效项目”与“已挂载但结果为 0”两种文案

#### Scenario: 描述摘要不泄漏 HTML 标签

- **WHEN** 一条任务的 `description` 为 `{ format: "html", content: "<p>富文本描述</p>" }`
- **THEN** 卡片摘要显示“富文本描述”一类的纯文本内容
- **AND** 卡片摘要不显示 `<p>` 等 HTML 标签文本

### Requirement: 任务卡片支持主操作与次操作

每张任务卡片 SHALL 暴露主操作"发起讨论"和次操作"任务来源"（如适用）。主操作 SHALL 触发聊天集成。次操作 SHALL 在外部浏览器中打开任务 URL。主操作和次操作所在的底部操作区 SHALL 与卡片主体区域以分割线在视觉上明确区分，操作区内的按钮点击 SHALL 不触发任务详情弹窗。系统在为"发起讨论"组装初始 prompt 时，SHALL 使用从结构化 `description` 中提取出的纯文本内容，而 SHALL NOT 原样拼接 Markdown 标记、HTML 标签或 RichText JSON 字符串。

#### Scenario: 点击本地任务的主操作

- **WHEN** 用户点击本地任务卡片上的"发起讨论"
- **THEN** 系统以任务描述的纯文本内容为初始 prompt 发起聊天会话
- **AND** 导航至 `/chat`
- **AND** 不打开任务详情弹窗

#### Scenario: 点击外部任务的主操作

- **WHEN** 用户点击外部任务卡片上的"发起讨论"（未来阶段）
- **THEN** 系统以外部任务描述的纯文本内容为初始 prompt 发起聊天会话
- **AND** 次操作打开外部系统的任务 URL
- **AND** 不打开任务详情弹窗

#### Scenario: 发起讨论 prompt 不泄漏 HTML 标签

- **WHEN** 一条云效任务的 `description` 为 `{ format: "html", content: "<table><tr><td>需求详细说明</td></tr></table>" }`
- **THEN** 系统为聊天组装的 prompt 包含“需求详细说明”等纯文本
- **AND** prompt 中不包含 `<table>`、`<tr>`、`<td>` 等 HTML 标签

### Requirement: 任务详情弹窗以查看模式渲染完整任务内容

任务详情弹窗 SHALL 默认进入查看模式。查看模式 SHALL 完整展示任务的标题、来源标识、创建时间、任务状态、标签（如有）和描述全文。任务状态 SHALL 以 UBadge 展示，`open` 使用 success 色、`closed` 使用 neutral 色，标签文案为「打开」或「关闭」。描述为空时 SHALL 显示「暂无描述」占位文案。查看模式 SHALL 不重复 TaskCard 上已有的业务操作按钮（发起讨论、任务来源、关联 Proposal、删除）。

任务描述 SHALL 使用 `TaskItem.description` 结构化对象渲染，而不再把 description 当作裸字符串。详情弹窗查看态 SHALL 统一通过 `UEditor` 的只读模式渲染描述内容，并按以下规则映射 `content-type`：

- `description.format === "html"` -> `content-type="html"`
- `description.format === "markdown"` -> `content-type="markdown"`
- `description.format === "plain_text"` -> `content-type="markdown"`

当打开的任务 `source === "yunxiao"` 时，系统 SHALL 在弹窗打开后按需读取该任务详情，而不是依赖列表阶段预取。详情读取期间，弹窗 SHALL 保持打开并继续展示列表已有的标题、来源、状态、标签和创建时间；描述区域 SHALL 独立显示详情加载状态。详情读取成功后，描述区域 SHALL 按返回的结构化 `description.format` 执行只读渲染，而不是原样回显字符串。详情读取失败时，弹窗 SHALL 保持打开，描述区域 SHALL 显示「详情加载失败」，且 SHALL NOT 将失败升级为任务列表级错误或关闭弹窗。

#### Scenario: 查看本地任务详情

- **WHEN** 用户从一条本地任务卡片打开详情弹窗，且该任务 `description` 为 `{ format: "plain_text", content: "第一行\n第二行" }`
- **THEN** 弹窗以查看模式呈现，展示完整标题、本地来源标识、相对创建时间、任务状态（打开/关闭）、标签（如有）以及完整描述
- **AND** 描述通过 `UEditor` 的只读 `markdown` 模式展示

#### Scenario: 查看描述为空的任务

- **WHEN** 任务的 `description.content` 为空字符串
- **THEN** 描述区域显示「暂无描述」占位文案

#### Scenario: 打开云效任务详情时按需加载描述

- **WHEN** 用户从一条云效任务卡片打开详情弹窗
- **THEN** 弹窗立即以查看模式呈现，并先展示列表已有的标题、来源标识、创建时间、任务状态与标签
- **AND** 系统在弹窗打开后按需请求该云效任务详情
- **AND** 在请求完成前，描述区域显示详情加载中的占位状态

#### Scenario: 云效 markdown 描述按 markdown 渲染

- **WHEN** 云效任务详情请求成功，且返回 `description = { format: "markdown", content: "## 标题\n- 列表项" }`
- **THEN** 描述区域使用 `UEditor` 的只读 `markdown` 模式展示该内容

#### Scenario: 云效 richtext 描述按 html 渲染

- **WHEN** 云效任务详情请求成功，且返回 `description = { format: "html", content: "<table><tr><td>概述</td></tr></table>" }`
- **THEN** 描述区域使用 `UEditor` 的只读 `html` 模式展示该内容
- **AND** 系统不把该 HTML 内容当普通文本回显

#### Scenario: 云效任务详情加载失败时保持弹窗可用

- **WHEN** 用户打开云效任务详情弹窗后，该任务详情请求失败
- **THEN** 弹窗保持打开
- **AND** 标题、来源标识、创建时间、任务状态和标签继续显示列表已有数据
- **AND** 描述区域显示「详情加载失败」
- **AND** 任务页列表区域不显示该失败的全局错误提示
