## MODIFIED Requirements

### Requirement: 事件推送使用 ipcRenderer.on 订阅模式

非流式的事件推送（下载进度、智能体安装进度等）SHALL 使用 `event.sender.send` + `ipcRenderer.on` 模式，预加载层封装为订阅和取消订阅 API。

#### Scenario: 订阅下载进度事件

- **WHEN** 渲染进程调用下载进度订阅 API 并传入处理函数
- **THEN** 预加载层内部注册对应的 `ipcRenderer.on('<domain>:event:progress', handler)`
- **AND** 返回取消订阅函数

#### Scenario: 取消订阅

- **WHEN** 组件卸载时调用取消订阅函数
- **THEN** 预加载层移除对应的 `ipcRenderer` 监听器
- **AND** 不影响其他组件的同事件监听

### Requirement: 所有订阅 API 必须返回取消订阅函数

预加载层暴露的每个事件订阅方法 SHALL 返回一个 `() => void` 类型的取消订阅函数，用于精确移除对应的监听器。

#### Scenario: 多组件同时订阅同一事件

- **WHEN** 两个组件分别调用同一事件的订阅 API，并传入 handlerA 和 handlerB
- **THEN** 两个处理函数均被注册
- **AND** 调用 handlerA 对应的取消订阅函数不影响 handlerB

### Requirement: 事件推送的消息结构统一

所有事件推送消息 SHALL 包含 `type` 和 `payload` 字段，其中 `type` 标识事件类型，`payload` 为事件数据。

#### Scenario: 下载进度事件结构

- **WHEN** 文件下载进度更新
- **THEN** 推送消息为 `{ type: 'progress', payload: { taskId, percent, bytesDownloaded, totalBytes } }`

#### Scenario: 智能体安装进度事件结构

- **WHEN** 智能体安装进度更新
- **THEN** 推送消息为 `{ type: 'installProgress', payload: { agentId, percent, status } }`
