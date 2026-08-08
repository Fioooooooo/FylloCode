## ADDED Requirements

### Requirement: spawn.session使用消息所属父Session的只读host context

Chat assistant text中的`spawn.session` SHALL从其MarkStream宿主取得包含该消息所属`workspaceId`与父`sessionId`的只读Signal host context，并将payload中的`sessionId`与该context一起交给owner-scoped spawned Session query。Renderer SHALL NOT从payload读取Workspace、父Session、Agent或状态，也 SHALL NOT在host context缺失时回退当前active Session猜测owner。

Host context只是查询键；Main SHALL重新验证Workspace sender、父Session和spawn owner。`show.time`及不需要外部状态的Signal SHALL保持不依赖host context。

#### Scenario: 历史消息所属Session不是当前active Session

- **WHEN** 历史assistant message属于父Session A而当前active Session为B
- **THEN** 其中`spawn.session` SHALL使用A的host context查询
- **AND** SHALL不把B作为parentSessionId

#### Scenario: Host context缺失

- **WHEN** ready `spawn.session`出现在没有有效Workspace或父Session host context的Chat text中
- **THEN** renderer SHALL显示非交互的通用不可用fallback
- **AND** SHALL不发起owner猜测或跨Session查询

### Requirement: spawn.session可以点击并消费外部authoritative view model

`spawn.session` type component SHALL显示可信query返回的Agent、明确状态文字与icon，并 SHALL提供button语义的点击入口打开spawned Session detail Slideover。组件 MAY消费renderer session store中的只读、owner-scoped view model和loading/error状态，但Signal node SHALL不把这些运行态写回payload、assistant message或Signal storage。

状态 SHALL仅显示`starting`、`running`、`idle`、`error`、`expired`或`interrupted`，不得只用颜色表达。Loading、not_found和query error SHALL使用明确文字；hover只改变颜色/背景/边界，焦点 SHALL可见。

#### Scenario: Running Signal重新查询后更新

- **WHEN** ready `spawn.session`首次查询为running并在level-triggered wake后查询为idle
- **THEN** 同一行内入口 SHALL更新为idle和对应状态文字
- **AND** 状态变化 SHALL来自Main query而非Signal payload或wake payload

#### Scenario: 点击打开详情

- **WHEN** 用户点击或用键盘激活ready且owner-matched的`spawn.session`
- **THEN** renderer SHALL打开对应spawned Session Slideover
- **AND** 关闭后 SHALL把焦点恢复到该Signal trigger

### Requirement: spawn.session重复渲染保持无持久化副作用

多个相同`spawn.session`节点、同一节点重复挂载或历史消息重新解析 SHALL至多复用同owner query cache，不得创建或复制spawned Session、turn、response、notification或Action state。Signal SHALL继续不进入EventRail或session attention。

#### Scenario: 同一response包含重复Signal

- **WHEN** assistant text包含两个payload相同且合法的`spawn.session`
- **THEN** 两个入口 MAY指向同一detail view model
- **AND** SHALL不调用任何create、continue、claim、dispatch、Action或Signal persistence API

#### Scenario: Signal漏发

- **WHEN** 父Agent没有在assistant text输出`spawn.session`
- **THEN** renderer SHALL不凭空在消息中创建Signal
- **AND** Main spawned Session事实与composer background入口 SHALL不受影响
