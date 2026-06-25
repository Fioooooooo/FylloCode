## MODIFIED Requirements

### Requirement: Session 条目支持选择和操作

系统 SHALL 高亮当前选中的 session，并在悬停、键盘聚焦或更多菜单打开时显示更多操作菜单（修改标题、删除）。选择 session 时 SHALL 从磁盘加载该 session 的历史消息；如果该 session 已在内存中加载过消息，则直接显示内存中的最新消息。选择 session SHALL NOT 停止、取消或失效其他 session 的运行中 stream，也 SHALL NOT 阻止其他 session 后台接收后续 stream 回调。

Session 条目在正常状态下 SHALL NOT 为默认隐藏的更多操作按钮永久保留固定右侧空白；标题区域 SHALL 使用前导媒体区和元信息之外的剩余横向空间进行单行截断。更多操作按钮出现时 SHALL 保持可点击和可识别，但不得通过扩大 chat sidebar 宽度实现。

#### Scenario: 选择 session 并加载历史消息

- **WHEN** 用户点击 session 条目
- **THEN** 该 session 以高亮背景被选中，其历史消息从磁盘加载并显示在 Chat 区域
- **AND** 若 session 元数据包含 `tokenUsage`，则恢复该值到 session 对象
- **AND** 若 session 元数据的 `tokenUsage` 包含 `cost`，则恢复 `cost` 到 session 对象

#### Scenario: 已加载消息的 session 不重复加载

- **WHEN** 用户切换到一个已加载过消息的 session
- **THEN** 直接显示已有消息，不重新从磁盘读取
- **AND** 若该 session 在后台 stream 期间已更新内存消息，则显示该内存最新状态

#### Scenario: 切换到其他 session 不停止后台 stream

- **WHEN** session A 的 `status` 为 `running`
- **AND** 用户点击 session B 条目
- **THEN** `activeSessionId` 切换为 session B
- **AND** session A 的运行中 stream 不被取消
- **AND** session A 后续收到的 stream chunk 继续更新 session A 的内存态

#### Scenario: 切回后台完成的 session

- **WHEN** 用户从 session A 切到 session B 后，session A 在后台收到 done 并更新为 `ended`
- **AND** 用户再次点击 session A
- **THEN** Chat 区域显示 session A 在后台接收完成后的内存消息
- **AND** session A 不因已加载而丢失后台接收的 assistant 内容

#### Scenario: Session 更多操作菜单

- **WHEN** 用户悬停在 session 条目上并点击三点菜单
- **THEN** 下拉菜单出现，包含修改标题或删除 session 的选项

#### Scenario: Session 标题区域不为隐藏菜单按钮永久让位

- **WHEN** session 条目未处于 hover、focus 或菜单打开状态
- **THEN** 标题区域不为隐藏的三点菜单按钮保留固定右侧 padding
- **AND** 标题仍以单行省略号截断
- **AND** chat sidebar 宽度不改变

### Requirement: Session 重命名和删除同步到磁盘

系统 SHALL 在用户修改 session 标题或删除 session 时，将变更同步持久化到磁盘。Session 标题修改 SHALL 使用应用内交互完成，不得调用浏览器原生 `window.prompt`。删除 session SHALL 使用全局确认弹窗 `useConfirmDialog()` 完成确认，不得调用浏览器原生 `window.confirm`。

修改标题入口的用户可见文案 SHALL 为“修改标题”。用户提交标题时，系统 SHALL 对输入执行首尾空白裁剪；裁剪后为空或与当前标题相同的输入 SHALL NOT 调用持久化更新。裁剪后非空且不同于当前标题的输入 SHALL 调用现有 session 更新链路写入磁盘 session 元数据文件。

删除确认弹窗 SHALL 使用危险操作语义，确认按钮文案 SHALL 为“删除会话”。用户取消确认时 SHALL NOT 删除 session；用户确认后 SHALL 调用现有删除链路删除磁盘上的元数据文件和消息文件。

#### Scenario: 修改 session 标题

- **WHEN** 用户通过菜单选择“修改标题”
- **AND** 输入不同于当前标题的非空标题并提交
- **THEN** 新标题写入磁盘 session 元数据文件

#### Scenario: 空标题不提交

- **WHEN** 用户通过菜单选择“修改标题”
- **AND** 提交的标题经首尾空白裁剪后为空
- **THEN** 系统不调用 session 标题持久化更新

#### Scenario: 未变化标题不提交

- **WHEN** 用户通过菜单选择“修改标题”
- **AND** 提交的标题经首尾空白裁剪后与当前标题相同
- **THEN** 系统不调用 session 标题持久化更新

#### Scenario: 删除 session

- **WHEN** 用户通过菜单删除 session
- **AND** 用户在确认弹窗中确认删除
- **THEN** 磁盘上对应的元数据文件和消息文件均被删除

#### Scenario: 取消删除 session

- **WHEN** 用户通过菜单删除 session
- **AND** 用户在确认弹窗中取消删除
- **THEN** 系统不调用 session 删除持久化操作
