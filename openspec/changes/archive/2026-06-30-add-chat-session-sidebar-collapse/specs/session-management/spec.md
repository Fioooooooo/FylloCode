## ADDED Requirements

### Requirement: Chat 左侧 Session Sidebar 支持折叠

系统 SHALL 在 Chat 主区域顶部提供一个侧栏切换按钮，用于折叠或展开左侧 session sidebar。该按钮由 `ChatContainer` 顶部现有 `panel-left` 图标按钮承载。

系统 SHALL 将左侧 session sidebar 的折叠状态作为 `/chat` 页面内存态管理。折叠状态 SHALL NOT 持久化到磁盘、全局偏好、session 元数据或 Pinia 全局 store。

当左侧 session sidebar 展开时，系统 SHALL 显示现有 `ChatSidebar` 内容，并保持 session 列表、新建 session、session 选择、高亮、更多菜单和后台 stream 行为不变。

当左侧 session sidebar 折叠时，系统 SHALL 隐藏左侧 session sidebar，并释放其横向宽度，使 Chat conversation 区域使用释放后的空间。折叠 SHALL NOT 卸载当前 active session、停止后台 stream、清空聊天输入、清空消息列表或改变右侧事件栏语义。

侧栏切换按钮 SHALL 根据当前折叠状态提供明确的可访问性语义：

- sidebar 展开时，按钮动作文案 SHALL 表示“折叠聊天列表”。
- sidebar 折叠时，按钮动作文案 SHALL 表示“展开聊天列表”。
- 按钮 SHALL 设置 `aria-label` 或等价可访问名称。
- 按钮 SHALL 设置 `aria-expanded` 表示左侧 session sidebar 当前是否展开。
- 按钮图标 SHALL 随当前状态切换，展开态显示收起/关闭侧栏语义，折叠态显示打开侧栏语义。

#### Scenario: 点击按钮折叠左侧 session sidebar

- **GIVEN** 用户位于 Chat 页面
- **AND** 左侧 session sidebar 当前处于展开状态
- **WHEN** 用户点击 Chat 顶部的 `panel-left` 侧栏切换按钮
- **THEN** 左侧 session sidebar 被折叠并不再占用原有 `w-65` 横向宽度
- **AND** Chat conversation 区域自然扩展到释放后的空间
- **AND** 当前 active session、消息列表、输入区和后台 stream 状态保持不变

#### Scenario: 再次点击按钮展开左侧 session sidebar

- **GIVEN** 用户位于 Chat 页面
- **AND** 左侧 session sidebar 当前处于折叠状态
- **WHEN** 用户再次点击 Chat 顶部的 `panel-left` 侧栏切换按钮
- **THEN** 左侧 session sidebar 恢复展开
- **AND** `ChatSidebar` 显示现有 session 列表
- **AND** session 列表的排序、选中状态、更多菜单和新建 session 行为保持不变

#### Scenario: 侧栏切换按钮语义跟随状态

- **GIVEN** 用户位于 Chat 页面
- **WHEN** 左侧 session sidebar 处于展开状态
- **THEN** 侧栏切换按钮的可访问名称和 `title` 表示“折叠聊天列表”
- **AND** 按钮 `aria-expanded` 表示 sidebar 当前已展开
- **WHEN** 左侧 session sidebar 处于折叠状态
- **THEN** 侧栏切换按钮的可访问名称和 `title` 表示“展开聊天列表”
- **AND** 按钮 `aria-expanded` 表示 sidebar 当前未展开

#### Scenario: 折叠状态不持久化

- **GIVEN** 用户位于 Chat 页面
- **AND** 用户已将左侧 session sidebar 折叠
- **WHEN** Chat 页面重新创建
- **THEN** 左侧 session sidebar 回到默认展开状态
- **AND** 系统不从磁盘、全局偏好、session 元数据或 Pinia 全局 store 读取 sidebar 折叠状态
