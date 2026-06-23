## ADDED Requirements

### Requirement: Chat action card 暴露稳定 DOM anchor

系统 SHALL 为 Chat 主会话中已经完成解析且具备 action id 的 Fyllo action card 暴露稳定 DOM anchor。该 anchor SHALL 使用 action id 作为定位值，并 SHALL 由 FylloCode renderer 控制生成；Agent 输出不得指定或覆盖该 anchor。

DOM anchor SHALL 挂载在可滚动定位到的 action card 根元素上。实现 SHALL 使用不会改变可访问名称或业务状态的 DOM 属性，例如 `data-fyllo-action-id="<actionId>"`。非 Chat 主会话入口、pending action、invalid action 或无法生成 action id 的 action card SHALL NOT 暴露可被 Chat event rail 使用的 Chat action anchor。

#### Scenario: ready Chat action card 暴露 data anchor

- **WHEN** Chat 主会话渲染一个 ready Fyllo action
- **AND** renderer 已按 transcript 位置生成 action id `chat:session-1:3:0:0`
- **THEN** 该 action card 根元素暴露可查询的 DOM anchor
- **AND** anchor 值等于 `chat:session-1:3:0:0`

#### Scenario: 非 Chat 主会话 action 不暴露 Chat anchor

- **WHEN** Proposal Apply 或 Archive SidePanel 渲染包含 `<fyllo-action>` 的 assistant text part
- **THEN** 该渲染入口不暴露 Chat event rail 使用的 Chat action anchor
- **AND** 该 action 不进入 Chat event rail 的待处理事件列表
