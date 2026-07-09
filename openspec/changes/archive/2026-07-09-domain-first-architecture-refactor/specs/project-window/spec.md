## MODIFIED Requirements

### Requirement: Project-scoped events are isolated by project window

系统 SHALL 只向对应项目窗口发送项目作用域事件，并防止不同项目中的同名运行时标识互相覆盖。

#### Scenario: Chat probe update is project scoped

- **WHEN** 项目 A 和项目 B 同时使用同一个 agent 创建 draft probe
- **THEN** 项目 A 的 probe registry entry SHALL NOT 覆盖项目 B 的 probe registry entry
- **AND** 项目 A 的 `session:chat:probe:update` SHALL 只发送给项目 A 的 project window
- **AND** 项目 B 的 project window SHALL NOT 应用项目 A 的 probe update

#### Scenario: Proposal status watcher is project scoped

- **WHEN** 项目 A 和项目 B 都存在相同 `changeId` 的 proposal
- **THEN** 系统 SHALL 分别维护项目 A 和项目 B 的 proposal status watcher
- **AND** 项目 A 的 proposal status update SHALL 只发送给项目 A 的 project window
- **AND** 项目 B 的 watcher SHALL NOT 被项目 A 的 watcher 替换或取消

#### Scenario: Same-project proposal watcher has multiple session subscribers

- **WHEN** 同一项目中的多个 session 同时 watch 相同 `changeId`
- **THEN** 系统 SHALL 复用同一个底层 proposal status watcher
- **AND** 状态变化 SHALL 分别发送给每个订阅该 `changeId` 的 session
- **AND** 取消其中一个 session 的订阅 SHALL NOT 关闭仍有其他 session 订阅的 watcher

#### Scenario: Global agent events reach every active window

- **WHEN** ACP agent registry、status、install progress、uninstall progress 或 unavailable 状态发生变化
- **THEN** 系统 SHALL 将该全局事件发送给所有未销毁窗口
- **AND** 每个窗口 SHALL 能更新其 agent UI 状态
