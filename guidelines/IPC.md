# IPC 通信

## 通信模型

```
渲染进程 (Vue)
  └─ window.api.<domain>.<method>()        # 请求-响应
  └─ window.api.<domain>.on<Event>()       # 事件订阅（由 preload 封装）

预加载脚本 (contextBridge)
  └─ 安全暴露 window.api

主进程 (Electron)
  └─ ipcMain.handle()   # 处理请求-响应
  └─ ipcMain.on()       # 处理单向消息
  └─ event.sender.send() / BrowserWindow.webContents.send()  # 推送事件
```

所有 channel 名称定义在 `shared/types/channels.ts`，格式为 `domain:action`。

## Channel 清单

### Chat（`window.api.chat`）

| Channel               | 常量                               | 类型   |
| --------------------- | ---------------------------------- | ------ |
| `chat:listSessions`   | `ChatChannels.listSessions`        | handle |
| `chat:createSession`  | `ChatChannels.createSession`       | handle |
| `chat:updateSession`  | `ChatChannels.updateSession`       | handle |
| `chat:removeSession`  | `ChatChannels.removeSession`       | handle |
| `chat:loadMessages`   | `ChatChannels.loadMessages`        | handle |
| `chat:persistMessage` | `ChatChannels.persistMessage`      | handle |
| `chat:stream:message` | `ChatStreamChannels.streamMessage` | handle |
| `chat:stream:port`    | `ChatStreamChannels.streamPort`    | handle |
| `chat:stream:cancel`  | `ChatStreamChannels.streamCancel`  | on     |

流式消息通过 `MessagePort` 传输，消息格式见 `shared/types/ipc.ts` 的 `StreamMessage<T>`。
`chat:persistMessage` 仅用于持久化 `role === "user"` 的消息；assistant 消息由主进程在
`chat:stream:message` 完成时写盘。

### Proposal（`window.api.proposal`）

| Channel                        | 常量                                   | 类型   |
| ------------------------------ | -------------------------------------- | ------ |
| `proposal:list`                | `ProposalChannels.list`                | handle |
| `proposal:readFile`            | `ProposalChannels.readFile`            | handle |
| `proposal:apply`               | `ProposalChannels.apply`               | handle |
| `proposal:stageStream`         | `ProposalChannels.stageStream`         | handle |
| `proposal:stageStream:port`    | `ProposalChannels.stageStreamPort`     | handle |
| `proposal:stageStream:cancel`  | `ProposalChannels.stageStreamCancel`   | handle |
| `proposal:archive`             | `ProposalChannels.archive`             | handle |
| `proposal:archive:port`        | `ProposalChannels.archivePort`         | handle |
| `proposal:archive:cancel`      | `ProposalChannels.archiveCancel`       | handle |
| `proposal:loadRun`             | `ProposalChannels.loadRun`             | handle |
| `proposal:loadRunMessages`     | `ProposalChannels.loadRunMessages`     | handle |
| `proposal:loadArchive`         | `ProposalChannels.loadArchive`         | handle |
| `proposal:loadArchiveMessages` | `ProposalChannels.loadArchiveMessages` | handle |

### Project（`window.api.project`）

| Channel              | 常量                         | 类型   |
| -------------------- | ---------------------------- | ------ |
| `project:list`       | `ProjectChannels.list`       | handle |
| `project:getById`    | `ProjectChannels.getById`    | handle |
| `project:update`     | `ProjectChannels.update`     | handle |
| `project:remove`     | `ProjectChannels.remove`     | handle |
| `project:openFolder` | `ProjectChannels.openFolder` | handle |

### Workflow（`window.api.workflow`）

| Channel           | 常量                      | 类型   |
| ----------------- | ------------------------- | ------ |
| `workflow:list`   | `WorkflowChannels.list`   | handle |
| `workflow:save`   | `WorkflowChannels.save`   | handle |
| `workflow:delete` | `WorkflowChannels.delete` | handle |

### Task（`window.api.task`）

| Channel       | 常量                  | 类型   |
| ------------- | --------------------- | ------ |
| `task:get`    | `TaskChannels.get`    | handle |
| `task:list`   | `TaskChannels.list`   | handle |
| `task:create` | `TaskChannels.create` | handle |
| `task:update` | `TaskChannels.update` | handle |
| `task:delete` | `TaskChannels.delete` | handle |

### Integration（`window.api.integration`）

| Channel                                | 常量                                         | 类型   |
| -------------------------------------- | -------------------------------------------- | ------ |
| `integration:getConnections`           | `IntegrationChannels.getConnections`         | handle |
| `integration:connect`                  | `IntegrationChannels.connect`                | handle |
| `integration:disconnect`               | `IntegrationChannels.disconnect`             | handle |
| `integrations:providers:list`          | `IntegrationChannels.providersList`          | handle |
| `integrations:providers:connect`       | `IntegrationChannels.providersConnect`       | handle |
| `integrations:providers:disconnect`    | `IntegrationChannels.providersDisconnect`    | handle |
| `integrations:providers:probe`         | `IntegrationChannels.providersProbe`         | handle |
| `integrations:providers:listResources` | `IntegrationChannels.providersListResources` | handle |
| `integrations:project:get`             | `IntegrationChannels.projectGet`             | handle |
| `integrations:project:set`             | `IntegrationChannels.projectSet`             | handle |

新增的 `integrations:*` 通道用于 provider/project 语义：

- `providers:*`：全局 provider 凭证、连接状态、探测与资源列表
- `project:*`：当前项目的阶段资源挂载配置

当前真实支持的 provider 仅覆盖 `yunxiao`。`integration:*` 仅保留当前仍被 renderer 消费的连接入口；provider/project 语义统一通过 `integrations:*` 通道提供。

### Settings（`window.api.settings`）

| Channel               | 常量                          | 类型   |
| --------------------- | ----------------------------- | ------ |
| `settings:get`        | `SettingsChannels.get`        | handle |
| `settings:getAppInfo` | `SettingsChannels.getAppInfo` | handle |
| `settings:update`     | `SettingsChannels.update`     | handle |

### ACP Agents（`window.api.acpAgents`）

| Channel                      | 常量                                | 类型   |
| ---------------------------- | ----------------------------------- | ------ |
| `acp:getRegistry`            | `AcpAgentChannels.getRegistry`      | handle |
| `acp:refreshRegistry`        | `AcpAgentChannels.refreshRegistry`  | handle |
| `acp:getIcons`               | `AcpAgentChannels.getIcons`         | handle |
| `acp:detectStatus`           | `AcpAgentChannels.detectStatus`     | handle |
| `acp:install`                | `AcpAgentChannels.install`          | handle |
| `acp:registryUpdated`        | `AcpAgentChannels.registryUpdated`  | event  |
| `acp:installProgress`        | `AcpAgentChannels.installProgress`  | event  |
| `acp:event:agentUnavailable` | `AcpAgentChannels.agentUnavailable` | event  |

当前 preload 公开的订阅入口为 `window.api.acpAgents.onRegistryUpdated()` 和
`window.api.acpAgents.onInstallProgress()`；事件订阅在 preload 内部使用
`ipcRenderer.on/off` 封装，renderer 业务代码不得直接触碰底层 bridge。
`acp:event:agentUnavailable` 当前仅作为主进程内部推送 channel 保留，尚未通过公开
preload API 暴露给 renderer。

## 响应格式

所有 handle 类型的 channel 返回 `IpcResponse<T>`（定义在 `shared/types/ipc.ts`）：

```ts
type IpcResponse<T> = { ok: true; data: T } | { ok: false; error: IpcErrorInfo };
```

`error.code` 的类型是 `IpcErrorCode` 联合，来自 `shared/constants/error-codes.ts`。未在该文件登记的错误码字面量不能通过类型检查。

渲染进程调用示例：

```ts
const res = await window.api.chat.listSessions({ projectId: "xxx" });
if (res.ok) {
  // res.data: Session[]
} else {
  // res.error: { code: IpcErrorCode; message: string }
}
```

## Handler 实现约束

所有主进程 handler 通过 `electron/main/ipc/_kit/` 下的四件套实现，详见 **[MainProcess](./MainProcess.md)**：

- `wrapHandler` — 请求-响应 handler 必须用它包装，异常自动归一化成 `{ ok: false, error }`。
- `makeStreamChannel` — 流式 handler 必须用它创建 MessagePort，禁止手写 `portClosed` 守卫、`sendChunk/sendDone/sendError` 模板。
- `validate` — handler 入参必须通过 zod schema 校验；schema 位于 `shared/schemas/ipc/<domain>.ts`，校验失败统一返回 `VALIDATION_ERROR`。
- `ipcError` — 构造带 `IpcErrorCode` 的 Error，替代所有 `createXxxError`/`Object.assign(new Error(), { code })` 样板。

handler 函数体应严格遵循 **validate → call service → return** 三步，业务逻辑必须下沉到 `electron/main/services/`。

## 错误码清单

所有合法错误码定义在 `shared/constants/error-codes.ts`。新增错误码**必须**通过 OpenSpec change 提交：

- 通用：`UNKNOWN_ERROR`、`VALIDATION_ERROR`、`STREAM_INIT_FAILED`
- Project：`PROJECT_NOT_FOUND`、`PROJECT_REQUIRED`
- Chat：`CHAT_SESSION_NOT_FOUND`
- Proposal：`PROPOSAL_NOT_FOUND`、`APPLY_RUN_NOT_FOUND`、`APPLY_RUN_NOT_READY`、`APPLY_SESSION_NOT_READY`、`APPLY_RUN_PERSIST_FAILED`、`STAGE_NOT_FOUND`、`STAGE_TYPE_NOT_IMPLEMENTED`
- Workflow：`WORKFLOW_NOT_FOUND`、`INVALID_WORKFLOW_NAME`、`BUILT_IN_WORKFLOW`
- ACP：`AGENT_NOT_FOUND`、`ACP_ERROR`、`ACP_NOT_READY`、`ACP_EXIT_GIVEUP`、`SPAWN_ERROR`
- Integration：`YUNXIAO_API_ERROR`

## 新增 Channel 流程

1. 在 `shared/types/channels.ts` 添加常量
2. 在 `shared/schemas/ipc/<domain>.ts` 添加 zod 入参 schema
3. 若需要新错误码，在 `shared/constants/error-codes.ts` 中登记（需 OpenSpec change）
4. 在 `electron/main/services/<domain>/<domain>-service.ts` 实现业务逻辑
5. 在 `electron/main/ipc/<domain>.ts` 中用 `wrapHandler` + `validate` 注册 handler，仅做 service 调用
6. 在 `electron/preload/api/<domain>.ts` 中暴露方法，同步更新 `preload/index.d.ts`
7. 在 `frontend/src/api/` 对应文件中添加调用封装
8. 为 service / domain 纯函数补单测
