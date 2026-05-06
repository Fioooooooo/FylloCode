# IPC 通信

## 通信模型

```
渲染进程 (Vue)
  └─ window.api.<domain>.<method>()        # 请求-响应
  └─ window.electron.ipcRenderer.on()      # 事件订阅

预加载脚本 (contextBridge)
  └─ 安全暴露 window.api 和 window.electron

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
| `chat:getSession`     | `ChatChannels.getSession`          | handle |
| `chat:createSession`  | `ChatChannels.createSession`       | handle |
| `chat:updateSession`  | `ChatChannels.updateSession`       | handle |
| `chat:removeSession`  | `ChatChannels.removeSession`       | handle |
| `chat:sendMessage`    | `ChatChannels.sendMessage`         | handle |
| `chat:stream:message` | `ChatStreamChannels.streamMessage` | handle |
| `chat:stream:port`    | `ChatStreamChannels.streamPort`    | handle |
| `chat:stream:cancel`  | `ChatStreamChannels.streamCancel`  | on     |

流式消息通过 `MessagePort` 传输，消息格式见 `shared/types/ipc.ts` 的 `StreamMessage<T>`。

### Project（`window.api.project`）

| Channel                  | 常量                             | 类型   |
| ------------------------ | -------------------------------- | ------ |
| `project:list`           | `ProjectChannels.list`           | handle |
| `project:getById`        | `ProjectChannels.getById`        | handle |
| `project:getDefaultPath` | `ProjectChannels.getDefaultPath` | handle |
| `project:create`         | `ProjectChannels.create`         | handle |
| `project:update`         | `ProjectChannels.update`         | handle |
| `project:remove`         | `ProjectChannels.remove`         | handle |
| `project:openFolder`     | `ProjectChannels.openFolder`     | handle |

### Workflow（`window.api.workflow`）

| Channel           | 常量                      | 类型   |
| ----------------- | ------------------------- | ------ |
| `workflow:list`   | `WorkflowChannels.list`   | handle |
| `workflow:save`   | `WorkflowChannels.save`   | handle |
| `workflow:delete` | `WorkflowChannels.delete` | handle |

### Integration（`window.api.integration`）

| Channel                          | 常量                                     | 类型   |
| -------------------------------- | ---------------------------------------- | ------ |
| `integration:listTools`          | `IntegrationChannels.listTools`          | handle |
| `integration:getConnection`      | `IntegrationChannels.getConnection`      | handle |
| `integration:connect`            | `IntegrationChannels.connect`            | handle |
| `integration:disconnect`         | `IntegrationChannels.disconnect`         | handle |
| `integration:listProjectConfigs` | `IntegrationChannels.listProjectConfigs` | handle |
| `integration:setProjectConfig`   | `IntegrationChannels.setProjectConfig`   | handle |
| `integration:listCustom`         | `IntegrationChannels.listCustom`         | handle |
| `integration:createCustom`       | `IntegrationChannels.createCustom`       | handle |
| `integration:removeCustom`       | `IntegrationChannels.removeCustom`       | handle |

### Settings（`window.api.settings`）

| Channel               | 常量                          | 类型   |
| --------------------- | ----------------------------- | ------ |
| `settings:get`        | `SettingsChannels.get`        | handle |
| `settings:update`     | `SettingsChannels.update`     | handle |
| `settings:listAgents` | `SettingsChannels.listAgents` | handle |

### Window（`window.api.window`）

| Channel                 | 常量                            | 类型   |
| ----------------------- | ------------------------------- | ------ |
| `window:minimize`       | `WindowChannels.minimize`       | on     |
| `window:maximize`       | `WindowChannels.maximize`       | on     |
| `window:close`          | `WindowChannels.close`          | on     |
| `window:toggleDevTools` | `WindowChannels.toggleDevTools` | on     |
| `window:isMaximized`    | `WindowChannels.isMaximized`    | handle |

## 响应格式

所有 handle 类型的 channel 返回 `IpcResponse<T>`（定义在 `shared/types/ipc.ts`）：

```ts
type IpcResponse<T> = { ok: true; data: T } | { ok: false; error: IpcErrorInfo };
```

渲染进程调用示例：

```ts
const res = await window.api.chat.listSessions({ projectId: "xxx" });
if (res.ok) {
  // res.data: Session[]
} else {
  // res.error: { code: string; message: string }
}
```

## 新增 Channel 流程

1. 在 `shared/types/channels.ts` 添加常量
2. 在 `electron/preload/index.ts` 的 `contextBridge.exposeInMainWorld` 中暴露方法
3. 在 `electron/preload/index.d.ts` 中更新 `window.api` 类型声明
4. 在 `electron/main/index.ts` 中注册 `ipcMain.handle` 或 `ipcMain.on`
5. 在 `frontend/src/api/` 对应文件中添加调用封装
