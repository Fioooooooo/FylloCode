## ADDED Requirements

### Requirement: 原文预览支持内容溢出与自动换行

系统 SHALL 在本地文件预览处于 ready 状态的原文模式时提供“内容溢出”和“自动换行”两个互斥显示选项。Slideover 每次打开时 SHALL 默认选择“内容溢出”；该选项 SHALL 只影响当前 Slideover 中 Monaco 的 `wordWrap` 布局，SHALL NOT 修改文件内容、文件位置、授权状态或任何持久化用户设置。

#### Scenario: 默认以内容溢出查看长行

- **WHEN** 用户打开任意可预览文本文件且 Slideover 进入 ready 原文模式
- **THEN** 系统 SHALL 以关闭 Monaco 自动换行的“内容溢出”模式展示内容
- **AND** 单行过长时用户 SHALL 能通过原有编辑器横向滚动查看完整内容

#### Scenario: 用户切换为自动换行

- **WHEN** 用户在原文模式中选择“自动换行”
- **THEN** 系统 SHALL 在不重新读取文件的情况下启用 Monaco 自动换行
- **AND** 原有只读、搜索、选择、复制和行列定位能力 SHALL 保持可用

#### Scenario: 换行偏好不跨 Slideover 保留

- **WHEN** 用户关闭已切换为“自动换行”的 Slideover 后重新打开任意文件预览
- **THEN** 新 Slideover SHALL 再次默认选择“内容溢出”
- **AND** 系统 SHALL NOT 写入任何设置、IPC 请求或文件内容

### Requirement: 常见 Markdown 文件后缀被识别为 Markdown

系统 SHALL 将大小写不敏感的 `.md`、`.markdown`、`.mdown`、`.mkdn`、`.mkd`、`.mdwn`、`.mdtxt` 和 `.mdtext` 后缀映射为本地预览 document 的 `language: "markdown"`。其他后缀 SHALL 继续使用既有语言识别或 `plaintext` 回退行为。

#### Scenario: 常见 Markdown 后缀获得 Markdown 语言

- **WHEN** 用户预览一个扩展名为列举的任一 Markdown 后缀的合格 UTF-8 文本文件，且后缀使用任意大小写
- **THEN** `preparePreview` 或 `confirmPreview` 返回的 ready document SHALL 包含 `language: "markdown"`
- **AND** Slideover SHALL 将该文件视为可提供 MarkStream 预览的 Markdown 文件

#### Scenario: 未识别后缀保持原有回退

- **WHEN** 用户预览一个不在 Markdown 后缀集合内的合格文本文件
- **THEN** 系统 SHALL 使用既有的扩展名映射或 `plaintext` 作为 document language
- **AND** SHALL NOT 因此显示 Markdown 渲染预览切换

### Requirement: Markdown 本地文件可在原文与 MarkStream 预览之间切换

系统 SHALL 在 ready document 的 `language` 为 `markdown` 时，在本地文件预览 Slideover 中提供“原文”和“MarkStream 预览”两个互斥查看模式，并 SHALL 默认显示原文。MarkStream 预览 SHALL 使用共享 `MarkStream` 组件渲染读取到的文本快照，且 SHALL 以非流式方式使用当前 renderer 主题。非 Markdown ready document SHALL NOT 显示或启用 MarkStream 预览模式。

#### Scenario: Markdown 文件默认显示原文

- **WHEN** 用户打开被识别为 Markdown 的本地文件且预览进入 ready 状态
- **THEN** 系统 SHALL 默认显示只读 Monaco 原文
- **AND** SHALL 同时显示原文与 MarkStream 预览的查看模式控制

#### Scenario: 切换到 MarkStream 渲染预览

- **WHEN** 用户在 Markdown 原文模式中选择“MarkStream 预览”
- **THEN** 系统 SHALL 使用当前 ready document 的完整文本快照渲染共享 MarkStream
- **AND** SHALL 清理当前 Monaco editor，避免同时保留编辑器资源
- **AND** 渲染预览内的绝对本地文件链接 SHALL 继续通过既有本地文件预览入口打开

#### Scenario: 切回原文保留当前文档定位与换行选择

- **WHEN** 用户从 Markdown 的 MarkStream 预览切回“原文”
- **THEN** 系统 SHALL 为当前 ready document 重建只读 Monaco editor
- **AND** SHALL 按 document 的 line/column 恢复源码定位，并使用用户在当前 Slideover 中选择的内容溢出或自动换行模式

#### Scenario: 非 Markdown 文件不展示渲染切换

- **WHEN** 用户打开语言不是 `markdown` 的合格文本文件
- **THEN** 系统 SHALL 只提供原文预览与内容溢出/自动换行控制
- **AND** SHALL NOT 创建 MarkStream 渲染器

## MODIFIED Requirements

### Requirement: Monaco 只读展示并支持源码定位

系统 SHALL 仅在预览结果为 `ready` 且用户选择原文模式后创建一个 `stream-monaco` editor，并将其配置为只读、显示行号、关闭 minimap、允许搜索、选择与复制。路径存在性解析 SHALL 先尝试完整文件名，只有完整路径不存在时才把末尾 `:line[:column]` 解释为定位信息。

#### Scenario: Ready 之前不创建 Monaco

- **WHEN** Slideover 处于 loading、confirmation-required 或 error
- **THEN** 系统 SHALL NOT 创建 Monaco editor
- **AND** SHALL 使用轻量 UI 展示当前状态

#### Scenario: 带行列定位的文件链接

- **WHEN** 完整 requested path 不存在但剥离有效 `:line[:column]` 后文件存在
- **THEN** 系统 SHALL 打开基础文件
- **AND** Monaco SHALL 将光标定位到指定 line/column 并在视口中 reveal

#### Scenario: 文件名本身以冒号数字结尾

- **WHEN** 完整 requested path 对应一个真实存在的文件且文件名以 `:12` 或 `:12:3` 结尾
- **THEN** 系统 SHALL 优先打开该完整文件名
- **AND** SHALL NOT 把末尾数字误判为 line/column

#### Scenario: 只读编辑器不修改文件

- **WHEN** 用户在 ready 状态的原文模式与 Monaco 交互
- **THEN** 编辑器 SHALL 阻止内容修改但允许搜索、选择和复制
- **AND** 系统 SHALL NOT 暴露保存或回写文件的动作
