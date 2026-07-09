# local-task-actions Specification

## Purpose

定义本地任务在任务看板和编辑 modal 中的快捷操作边界，使打开状态任务优先提供可恢复的关闭流程，并将永久删除入口限制在更明确的编辑上下文中。

## Requirements

### Requirement: 打开状态本地任务卡片提供关闭操作

系统 SHALL 在打开状态的本地任务卡片上提供关闭任务的快捷操作，并 SHALL NOT 在卡片上提供永久删除操作。

#### Scenario: 打开状态本地任务显示关闭 icon button

- **WHEN** 用户在任务看板查看本地来源的打开状态任务
- **THEN** 该任务卡片 SHALL 在卡片操作区展示一个作用为关闭任务的 icon-only button
- **AND** 该 button SHALL 提供可访问名称 `关闭任务`
- **AND** 该任务卡片 SHALL NOT 展示删除任务 button

#### Scenario: 关闭打开状态本地任务前确认

- **WHEN** 用户点击打开状态本地任务卡片上的关闭任务 button
- **THEN** 系统 SHALL 展示确认弹窗，标题为 `关闭任务？`
- **AND** 确认弹窗 SHALL 说明该任务会移到“关闭”列表且可重新打开
- **AND** 确认按钮 SHALL 显示 `关闭任务`

#### Scenario: 确认关闭打开状态本地任务

- **WHEN** 用户在关闭任务确认弹窗中确认
- **THEN** 系统 SHALL 将该任务状态更新为 `closed`
- **AND** 如果当前任务列表筛选为打开状态，该任务 SHALL 从当前可见列表移出

#### Scenario: 取消关闭打开状态本地任务

- **WHEN** 用户在关闭任务确认弹窗中取消
- **THEN** 系统 SHALL NOT 修改该任务状态
- **AND** 系统 SHALL 保持该任务卡片可见

#### Scenario: 已关闭本地任务不显示卡片状态操作

- **WHEN** 用户在任务看板查看本地来源的已关闭任务
- **THEN** 该任务卡片 SHALL NOT 展示关闭任务 icon button
- **AND** 该任务卡片 SHALL NOT 展示删除任务 button

### Requirement: 本地任务删除入口位于编辑 modal 内

系统 SHALL 只在本地任务详情 modal 的编辑态中提供永久删除入口。

#### Scenario: 本地任务查看态不显示删除入口

- **WHEN** 用户打开本地任务详情 modal 且 modal 处于查看态
- **THEN** 系统 SHALL NOT 展示删除任务 button

#### Scenario: 本地任务编辑态显示删除入口

- **WHEN** 用户在本地任务详情 modal 中进入编辑态
- **THEN** 系统 SHALL 在 modal footer 左侧展示 `删除任务` button
- **AND** 该 button SHALL 使用删除图标和危险操作颜色
- **AND** modal footer 右侧 SHALL 保留 `取消` 和 `保存` 操作

#### Scenario: 非本地任务不显示删除入口

- **WHEN** 用户打开非本地任务详情 modal
- **THEN** 系统 SHALL NOT 展示删除任务 button

#### Scenario: 删除本地任务前确认

- **WHEN** 用户点击本地任务编辑 modal 内的 `删除任务` button
- **THEN** 系统 SHALL 展示确认弹窗，标题为 `删除任务？`
- **AND** 确认弹窗 SHALL 说明该任务将被永久删除且不可恢复
- **AND** 确认按钮 SHALL 显示 `删除任务`

#### Scenario: 确认删除本地任务

- **WHEN** 用户在删除任务确认弹窗中确认
- **THEN** 系统 SHALL 删除该本地任务
- **AND** 系统 SHALL 关闭任务详情 modal
- **AND** 系统 SHALL 清空该 modal 的当前任务详情状态

#### Scenario: 取消删除本地任务

- **WHEN** 用户在删除任务确认弹窗中取消
- **THEN** 系统 SHALL NOT 删除该任务
- **AND** 系统 SHALL 保持任务编辑 modal 打开
