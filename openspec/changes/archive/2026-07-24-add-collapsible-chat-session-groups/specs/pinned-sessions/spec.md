## ADDED Requirements

### Requirement: 聊天侧栏分组可以独立折叠

系统 SHALL 允许用户独立展开或折叠聊天侧栏中的每个非空会话分组。分组首次出现时 SHALL 默认展开，折叠状态 SHALL 只在当前聊天侧栏挂载期间保留。

#### Scenario: 分组首次显示

- **WHEN** 一个非空会话分组首次显示在聊天侧栏中
- **THEN** 该分组 SHALL 处于展开状态
- **AND** 分组内会话 SHALL 可见

#### Scenario: 用户折叠一个分组

- **WHEN** 用户折叠一个已展开的会话分组
- **THEN** 该分组 SHALL 只保留可操作的分组标题
- **AND** 其他分组的展开或折叠状态 SHALL 保持不变
- **AND** 折叠动作 SHALL NOT 清除该分组列表的滚动位置或中断后台会话执行

#### Scenario: 用户重新展开一个分组

- **WHEN** 用户展开一个已折叠的会话分组
- **THEN** 该分组 SHALL 恢复展示会话列表
- **AND** 列表 SHALL 恢复折叠前的滚动位置

#### Scenario: active 会话进入另一个分组

- **WHEN** `activeSession` 从不属于某个分组变为属于该分组
- **THEN** 系统 SHALL 展开新的 active 会话所属分组
- **AND** 系统 SHALL NOT 自动折叠其他分组

#### Scenario: 用户折叠 active 会话所在分组

- **WHEN** 用户手动折叠当前 `activeSession` 所在分组
- **AND** `activeSession` 仍属于同一个分组
- **THEN** 该分组 SHALL 保持折叠

#### Scenario: 非 active 会话跨组移动

- **WHEN** 一个非 active 会话因置顶或取消置顶进入另一个已折叠分组
- **THEN** 目标分组 SHALL 保持折叠
- **AND** 其他分组的展开或折叠状态 SHALL 保持不变

#### Scenario: 所有分组均被折叠

- **WHEN** 用户折叠所有非空会话分组
- **THEN** 所有分组标题 SHALL 按既定分组顺序自然排列
- **AND** 系统 SHALL NOT 将任一标题强制固定到底部

## MODIFIED Requirements

### Requirement: 聊天侧栏分组展示会话

系统 SHALL 根据置顶状态将已持久化会话分为置顶会话与最近会话。每个会话 SHALL 恰好出现在一个组中，且两个组内均 SHALL 按 `updatedAt` 降序排列。每个非空分组 SHALL 展示包含文本、会话数量和展开状态的可操作标题，空分组 SHALL NOT 显示。

#### Scenario: 同时存在置顶和普通会话

- **WHEN** 会话列表同时包含置顶和未置顶会话
- **THEN** 侧栏 SHALL 展示“置顶会话”和“最近会话”分组标题
- **AND** 每个标题 SHALL 展示对应分组的会话数量和展开状态
- **AND** 置顶会话 SHALL 只出现在置顶会话组
- **AND** 未置顶会话 SHALL 只出现在最近会话组

#### Scenario: 没有置顶会话

- **WHEN** 会话列表不包含置顶会话但包含普通会话
- **THEN** 侧栏 SHALL NOT 展示空的置顶会话分组或分组标题
- **AND** 侧栏 SHALL 展示可折叠的“最近会话”分组标题及其会话数量
- **AND** 最近会话 SHALL 按 `updatedAt` 降序排列

#### Scenario: 置顶会话通过分组标题识别

- **WHEN** 侧栏渲染一个置顶会话
- **THEN** 该会话 SHALL 位于带文本的置顶会话分组中
- **AND** 置顶状态 SHALL NOT 仅依赖颜色表达
- **AND** 会话条目 SHALL NOT 为置顶状态重复渲染图钉标识

### Requirement: 置顶会话组保留普通会话可视空间

系统 SHALL 让聊天侧栏中所有展开的非空会话分组平分分组标题之外的剩余可用高度。会话列表可用高度 SHALL 排除顶部“新建会话”操作区域和所有折叠分组的标题高度。

#### Scenario: 置顶和最近会话组同时展开

- **WHEN** 置顶会话组和最近会话组均处于展开状态
- **THEN** 两个分组 SHALL 平分分组标题之外的剩余可用高度
- **AND** 两个分组的溢出内容 SHALL 分别在各自列表中纵向滚动

#### Scenario: 最近会话组被折叠

- **WHEN** 置顶会话组展开且最近会话组折叠
- **THEN** 最近会话组 SHALL 只占用标题高度
- **AND** 置顶会话组 SHALL 占用标题之外的全部剩余可用高度
- **AND** 最近会话组标题 SHALL 因自然文档顺序显示在置顶会话组之后

#### Scenario: 置顶会话组被折叠

- **WHEN** 置顶会话组折叠且最近会话组展开
- **THEN** 置顶会话组 SHALL 只占用标题高度
- **AND** 最近会话组 SHALL 占用标题之外的全部剩余可用高度

#### Scenario: 只有最近会话组

- **WHEN** 侧栏只有非空的最近会话组
- **THEN** 最近会话组 SHALL 占用分组标题之外的全部剩余可用高度
- **AND** 溢出的最近会话 SHALL 在该分组内纵向滚动

#### Scenario: 首次发送产生的新会话

- **WHEN** 用户从草稿态首次发送消息并创建一个新会话
- **THEN** 新会话 SHALL 默认未置顶并出现在最近会话组
- **AND** `activeSession` 进入最近会话组时该分组 SHALL 展开
- **AND** 其他分组的展开或折叠状态 SHALL 保持不变
