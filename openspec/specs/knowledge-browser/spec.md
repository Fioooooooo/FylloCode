# knowledge-browser Specification

## Purpose

定义项目级 durable knowledge 的安全浏览边界：通过现有 scanner-backed index 展示正常条目与扫描错误，提供只读 Markdown 阅读、项目切换隔离，以及仅按合法名称执行的二次确认删除；主要契约源为 `insight:knowledge` domain-first IPC 与 knowledge scanner。

## Requirements

### Requirement: Knowledge browser exposes a project-scoped index

系统 SHALL 通过 `insight:knowledge` domain-first contract 为当前项目提供 knowledge browser index，并复用现有 knowledge scanner 计算条目元数据、computed status 和扫描错误。

Browser index 中的正常条目 SHALL 包含 `name`、`description`、`type`、`updatedAt` 和 `status`，但 SHALL NOT 包含完整 Markdown body；`status` SHALL 为 `active`、`suspect` 或 `unknown`。扫描错误 SHALL 包含文件 path、错误类型和错误信息；仅当 path 对应合法 knowledge name 时才 SHALL 暴露该 name 供 raw document 操作。

#### Scenario: Browser query returns valid entries and isolated errors

- **WHEN** 当前项目的 knowledge 目录同时包含合法条目和无法读取或解析的 Markdown 文件
- **THEN** `insight:knowledge:getBrowser` SHALL 返回合法条目的摘要与 computed status
- **AND** SHALL 在 `errors` 中返回每个隔离错误的 path、类型和信息
- **AND** 单个损坏文件 SHALL NOT 阻止其他合法条目显示
- **AND** browser response SHALL NOT 携带所有条目的完整 Markdown body

#### Scenario: Missing knowledge directory is an empty browser

- **WHEN** 当前项目 app data 中不存在 knowledge 目录
- **THEN** browser index SHALL 返回空 `entries` 和空 `errors`
- **AND** SHALL NOT 将目录缺失作为页面加载错误

#### Scenario: Browser query remains project scoped

- **WHEN** renderer 请求一个项目的 knowledge browser index
- **THEN** main SHALL 通过受校验的 `projectId` 解析项目路径
- **AND** SHALL 只扫描该项目 app data 下的 knowledge 目录
- **AND** SHALL NOT 接受 renderer 提供的任意文件系统路径

### Requirement: Knowledge browser provides an independent two-pane page

系统 SHALL 提供独立 `/knowledge` 页面，以左侧 knowledge 列表和右侧只读正文组成双栏 reader，并 SHALL NOT 将该页面注册为 ActivityBar item。

#### Scenario: Loaded knowledge appears in grouped list

- **WHEN** `/knowledge` 成功加载非空 browser index
- **THEN** 左侧列表 SHALL 按 `project`、`reference`、`feedback` 分组展示正常条目
- **AND** 每个条目 SHALL 展示可辨认的 name、description 或回退文本、更新时间和 computed status
- **AND** computed status SHALL 使用文字 badge 标明 `active`、`suspect` 或 `unknown`，不得只靠颜色表达
- **AND** 每组 SHALL 优先排列 `suspect`、`unknown` 条目，再排列 `active` 条目，并在相同优先级内按 `updatedAt` 倒序排列

#### Scenario: Scan errors remain visible

- **WHEN** browser index 包含扫描错误
- **THEN** 左侧 SHALL 在独立“无法索引”分组展示错误 path 和原因
- **AND** 合法文件名的错误项 SHALL 可被选择以读取 raw document
- **AND** 非法文件名的错误项 SHALL NOT 提供读取或删除动作

#### Scenario: Empty knowledge page remains explicit

- **WHEN** browser index 的 `entries` 和 `errors` 都为空
- **THEN** 页面 SHALL 展示包含图标、标题和描述的 knowledge 空状态
- **AND** 页面 SHALL 保持双栏页面的治理语境，不显示过期项目数据

#### Scenario: Browser loading fails

- **WHEN** browser index 请求失败
- **THEN** 页面 SHALL 展示明确加载错误和错误信息
- **AND** SHALL NOT 将上一项目的 index 作为当前结果展示

### Requirement: Knowledge detail renders complete raw markdown as read-only content

系统 SHALL 在用户选择可读取条目后，通过现有 `insight:knowledge:readEntry` 获取完整 raw Markdown，并在右侧以只读 Markdown 渲染。

展示层 SHALL 只识别文件开头 YAML frontmatter 的 `---` 边界，并将包含边界的完整 frontmatter 包装为 YAML code block；展示层 SHALL NOT 解析、排序、裁剪、重组或保存 frontmatter 字段，也 SHALL NOT 限制 anchors 或其他数组的展示条数。

#### Scenario: Selected entry renders frontmatter and body

- **WHEN** 用户选择一个包含合法 YAML frontmatter 和正文的 knowledge 条目
- **THEN** 右侧 SHALL 渲染该文件的完整 frontmatter 和正文
- **AND** frontmatter SHALL 作为 YAML code block 可读展示
- **AND** 正文 SHALL 继续按 Markdown 渲染
- **AND** renderer SHALL NOT 因 frontmatter 字段数量或数组长度变化而执行字段级 UI 解析

#### Scenario: Frontmatter display does not mutate source

- **WHEN** 页面为 Markdown renderer 包装 frontmatter
- **THEN** 该转换 SHALL 只作用于内存中的展示内容
- **AND** SHALL NOT 调用 knowledge save API
- **AND** SHALL NOT 修改 app data 中的 knowledge 文件

#### Scenario: Markdown without recognized frontmatter remains readable

- **WHEN** 选中的 raw document 没有完整且可识别的开头 frontmatter 边界
- **THEN** 展示层 SHALL 将原文不经字段解析地交给 Markdown renderer
- **AND** 页面 SHALL 同时保留 browser index 提供的扫描错误提示

#### Scenario: Stale detail response is ignored

- **WHEN** 用户在前一个 raw document 请求完成前选择另一个条目
- **THEN** 迟到的前一个响应 SHALL NOT 覆盖当前条目的正文、错误或 loading 状态

### Requirement: Users delete one knowledge entry after destructive confirmation

系统 SHALL 允许用户从 knowledge reader 删除一个具有合法 knowledge name 的条目，并在调用删除 API 前要求二次确认。删除 API SHALL 只允许删除当前项目 app data 中 `knowledge/<validated-name>.md`，不得接受任意 path。

#### Scenario: User cancels knowledge deletion

- **WHEN** 用户点击删除并在确认弹窗中取消
- **THEN** 系统 SHALL NOT 调用 `insight:knowledge:deleteEntry`
- **AND** 当前列表、选择和正文 SHALL 保持不变

#### Scenario: Confirmed deletion succeeds

- **WHEN** 用户在包含 knowledge name 和不可撤销说明的确认弹窗中点击“删除知识”
- **AND** `insight:knowledge:deleteEntry` 成功删除目标文件
- **THEN** 页面 SHALL 刷新 browser index
- **AND** SHALL 优先选择原列表中的下一可读条目，没有下一项时选择上一项
- **AND** 删除后没有条目时 SHALL 展示空状态
- **AND** 系统 SHALL NOT 删除其他 knowledge 文件或仓库文件

#### Scenario: Confirmed deletion fails

- **WHEN** 用户确认删除但 delete IPC 返回 not found 或其他错误
- **THEN** 页面 SHALL 保留当前条目、选择和已加载正文
- **AND** SHALL 展示“发生了什么 + 下一步怎么做”的删除错误
- **AND** SHALL 允许用户重试，且不得伪造删除成功状态

#### Scenario: Invalid error path cannot be deleted

- **WHEN** “无法索引”项的文件 stem 不能通过 knowledge name schema
- **THEN** 页面 SHALL NOT 提供删除动作
- **AND** main SHALL NOT 暴露按任意 path 删除文件的能力

### Requirement: Knowledge browser reacts safely to project changes

系统 SHALL 让 knowledge browser index 和 detail 始终绑定当前项目，并隔离旧项目的迟到请求。

#### Scenario: Current project changes while browser is loading

- **WHEN** knowledge browser 请求进行中且当前项目切换
- **THEN** store SHALL 清除旧选择和旧项目展示状态
- **AND** 旧请求完成后 SHALL NOT 提交为新项目结果
- **AND** 页面 SHALL 加载新项目的 browser index
