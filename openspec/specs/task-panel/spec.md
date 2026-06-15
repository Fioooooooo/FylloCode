# task-panel 规范

## Purpose

定义任务面板页面的布局、任务卡片展示、渠道切换交互，以及"点击进聊天"的核心入口行为。

## Requirements

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

### Requirement: 任务卡片主体区域点击打开任务详情弹窗

每张任务卡片的主体内容区域（标题、描述、标签等位于底部操作区分割线以上的部分）SHALL 响应点击事件，打开「任务详情弹窗」。底部操作区（包含「发起讨论」「任务来源」「关联 Proposal」「删除」等按钮的区域）SHALL 不响应该点击行为，其中各按钮 SHALL 保持原有交互不受影响。该规则对本地任务、云效任务、GitHub 任务一致生效。

#### Scenario: 点击卡片标题或描述区域

- **WHEN** 用户点击任务卡片的标题或描述文本区域
- **THEN** 任务详情弹窗以查看模式打开
- **AND** 弹窗内容对应该任务的最新数据

#### Scenario: 点击卡片底部操作区按钮

- **WHEN** 用户点击「发起讨论」「任务来源」「关联 Proposal」或「删除」中的任意按钮
- **THEN** 仅触发该按钮原有行为
- **AND** 不打开任务详情弹窗

#### Scenario: 同时存在多个任务时切换查看

- **WHEN** 用户在详情弹窗已打开的状态下点击另一张任务卡片的主体区域
- **THEN** 弹窗内容更新为新选中任务的最新数据
- **AND** 弹窗保持打开状态

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

#### Scenario: 查看外部任务详情

- **WHEN** 用户从一条云效或 GitHub 任务卡片打开详情弹窗
- **THEN** 弹窗以查看模式呈现，展示完整标题、来源标识、创建时间、任务状态、标签与描述
- **AND** 弹窗不渲染「编辑」按钮

### Requirement: 任务详情弹窗为本地任务提供编辑模式

任务详情弹窗 SHALL 仅对本地任务（`source === "local"`）暴露「编辑」按钮。点击「编辑」后，弹窗 SHALL 切换为编辑模式：将当前任务的 `title`、`description` 和 `status` 复制到本地表单状态，标题以 `UInput` 渲染、描述以 4 行 `UTextarea` 渲染，状态以水平 `URadioGroup` 渲染（选项为「打开」/「关闭」，与外层状态筛选器样式一致）。编辑模式 SHALL 不支持修改 `labels`、`assignee`、`proposalId` 或其他字段。

#### Scenario: 进入编辑模式

- **WHEN** 用户在本地任务详情弹窗的查看模式下点击「编辑」
- **THEN** 弹窗切换为编辑模式
- **AND** 标题输入框预填当前 `title`
- **AND** 描述输入框预填当前 `description`
- **AND** 状态单选组预填当前 `status`

#### Scenario: 外部任务无编辑入口

- **WHEN** 用户打开外部任务（云效或 GitHub）的详情弹窗
- **THEN** 弹窗中不显示「编辑」按钮
- **AND** 用户无法进入编辑模式

### Requirement: 任务详情弹窗保存本地任务编辑

编辑模式 SHALL 提供「取消」和「保存」两个底部操作。当标题输入为空（去除前后空白后为空字符串）时，「保存」按钮 SHALL 禁用。点击「保存」时系统 SHALL 调用任务更新能力，提交 `title`、`description` 和 `status` 三个字段。保存成功后，系统 SHALL 展示 toast 提示「保存成功」，弹窗 SHALL 关闭，列表中的对应任务卡片 SHALL 同步更新（包括状态变更在筛选器下的自动生效）。保存失败时，弹窗 SHALL 保留在编辑模式、保留用户输入，并展示错误提示。

#### Scenario: 保存有效编辑

- **WHEN** 用户在编辑模式修改 `title`、`description` 或 `status` 后点击「保存」，且标题非空
- **THEN** 系统调用任务更新能力提交新的 `title`、`description` 和 `status`
- **AND** 系统展示 toast「保存成功」
- **AND** 弹窗关闭
- **AND** 列表中对应任务卡片同步刷新

#### Scenario: 仅修改状态后保存

- **WHEN** 用户在编辑模式仅修改 `status` 由打开改为关闭后点击「保存」
- **THEN** 系统提交包含新 `status` 的更新
- **AND** 任务卡片按当前激活的状态筛选器自动显示或隐藏
- **AND** 弹窗关闭并展示成功 toast

#### Scenario: 标题为空时禁用保存

- **WHEN** 用户在编辑模式将标题清空（或仅含空白字符）
- **THEN** 「保存」按钮处于禁用状态

#### Scenario: 保存失败保留编辑状态

- **WHEN** 任务更新能力调用失败
- **THEN** 弹窗保留在编辑模式
- **AND** 用户输入的标题与描述未被清空
- **AND** 弹窗展示错误提示

### Requirement: 任务详情弹窗在取消或关闭时直接丢弃编辑

编辑模式下，点击「取消」按钮或关闭弹窗时，系统 SHALL 直接丢弃本地表单状态、不保存任何修改、不进行未保存改动的二次确认。任务列表中对应任务的数据 SHALL 保持不变。

#### Scenario: 编辑模式点击取消

- **WHEN** 用户在编辑模式修改了内容后点击「取消」
- **THEN** 弹窗切回查看模式
- **AND** 修改的内容被丢弃，任务数据保持不变
- **AND** 不出现二次确认提示

#### Scenario: 编辑模式直接关闭弹窗

- **WHEN** 用户在编辑模式修改了内容后通过遮罩、关闭按钮或键盘关闭弹窗
- **THEN** 弹窗关闭
- **AND** 修改的内容被丢弃，任务数据保持不变
- **AND** 不出现二次确认提示

### Requirement: 任务面板提供渠道筛选标签

系统 SHALL 在任务列表顶部渲染渠道筛选标签，其中“本地”标签固定存在，其他第三方标签 SHALL 由当前项目在 `/integration` 的 `project-management` 阶段已挂载的 provider 资源动态感知生成。仅当当前项目存在至少一条属于某 provider 的项目级挂载资源时，该 provider 的任务来源标签才 SHALL 出现在 `/task` 页。provider 的全局连接状态或凭证是否过期 SHALL NOT 影响标签是否出现。本次真实接入阶段中，“云效”标签 SHALL 在当前项目挂载至少一个 `yunxiao / projex-project` 资源时出现，并显示真实云效任务；未挂载时 SHALL NOT 显示“云效”标签。当前实现中的 GitHub 仍可继续保留为后续阶段能力，不要求本 change 同步接入真实数据。

#### Scenario: 当前项目未挂载云效项目

- **WHEN** 用户已连接云效 provider，但当前项目的 `project-management` 阶段没有任何 `yunxiao / projex-project` 挂载资源
- **THEN** `/task` 页面不显示“云效”标签

#### Scenario: 当前项目挂载了至少一个云效项目

- **WHEN** 当前项目的 `project-management` 阶段存在至少一条 `{ providerId: "yunxiao", resourceType: "projex-project" }` 挂载资源
- **THEN** `/task` 页面显示“云效”标签
- **AND** 点击该标签后页面加载真实云效任务，而非 mock 数据

#### Scenario: 云效已挂载但 provider 断开连接或凭证过期

- **WHEN** 当前项目仍保留云效挂载资源，但云效 provider 已断开连接或凭证过期
- **THEN** `/task` 页面仍显示“云效”标签
- **AND** 标签可见性不因 provider 当前可用性而变化

### Requirement: 任务面板为本地任务提供状态筛选

系统 SHALL 仅在"本地"标签激活时显示状态筛选单选组（"打开" / "关闭"）。筛选器 SHALL 仅作用于本地任务。默认筛选值为"打开"。

#### Scenario: 筛选打开状态

- **WHEN** 用户在"本地"标签下选择"打开"筛选
- **THEN** 仅显示 `status === "open"` 的本地任务

#### Scenario: 筛选关闭状态

- **WHEN** 用户在"本地"标签下选择"关闭"筛选
- **THEN** 仅显示 `status === "closed"` 的本地任务

### Requirement: 任务面板支持新建本地任务

系统 SHALL 提供"新建任务"按钮，点击后打开弹窗以创建新的本地任务。弹窗 SHALL 包含标题（必填）和描述（可选）字段。

#### Scenario: 新建本地任务

- **WHEN** 用户点击"新建任务"并填写标题
- **THEN** 创建一条 `status: "open"`、`source: "local"` 的新本地任务
- **AND** 任务立即出现在列表中

#### Scenario: 取消任务创建

- **WHEN** 用户打开创建弹窗后点击取消
- **THEN** 不创建任务，弹窗关闭

### Requirement: 任务面板支持删除本地任务

系统 SHALL 允许从任务卡片删除本地任务。删除 SHALL 需要确认。

#### Scenario: 删除本地任务

- **WHEN** 用户点击本地任务的删除按钮并确认
- **THEN** 任务从存储中移除，列表同步更新

### Requirement: 任务面板显示任务来源标识

每张任务卡片 SHALL 显示来源特定的标识，标明任务的来源系统（如“本地”“云效 YX-1024”“example/repo#88”）。标识 SHALL 包含代表来源系统的图标。对于真实云效任务，系统 SHALL 使用 `sourceMeta.key` 渲染来源标识，并 SHALL 复用 `sourceMeta.url` 作为“任务来源”按钮的跳转目标；该 URL 由主进程 `yunxiao-task-adapter` 按 workitem 类型规则构造，而不是由 renderer 自行猜测。

#### Scenario: 显示真实云效任务来源标识与跳转按钮

- **WHEN** 页面显示一条真实云效任务且该任务包含 `sourceMeta.key` 与 `sourceMeta.url`
- **THEN** 卡片显示“云效 <key>”作为来源标识
- **AND** 卡片显示“任务来源”按钮
- **AND** 点击“任务来源”按钮后，系统使用该任务的 `sourceMeta.url` 打开对应云效详情页
