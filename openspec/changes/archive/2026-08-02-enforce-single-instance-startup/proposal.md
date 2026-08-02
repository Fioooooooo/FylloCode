## Why

FylloCode 当前会让每个进程在 `app.whenReady()` 后独立执行 migration runner 和其他 app-data writer；两个实例并发启动时可能同时修改迁移账本或持久化数据。Multi-root Workspace 的 required cutover 会扩大启动期写入范围，因此必须先建立可验证的单实例启动契约。

## What Changes

- 主进程在注册 `app.whenReady()` 启动链和任何 app-data writer 之前同步申请 Electron 单实例锁。
- 未取得锁的第二实例立即请求退出，并且不得执行 shell PATH 同步、migration、MCP host、IPC 注册、窗口创建、workflow 初始化或 Agent 预热。
- 主实例监听 `second-instance`：启动完成后恢复并聚焦最近活跃的可用窗口；没有可用窗口时创建 launcher。
- 主实例尚在启动时收到第二实例事件，只记录一次待处理聚焦请求；必须等 migration、IPC/event 注册和首窗创建完成后再聚焦，不得为响应第二实例提前越过启动顺序。
- 第二实例的 argv、cwd 和 additionalData 不在本变更中转发为打开项目、文件夹或其他业务动作。

## Capabilities

### New Capabilities

- `single-instance-startup`: 定义单实例锁的取得时机、第二实例退出隔离、主实例窗口聚焦以及启动中事件的延迟处理。

### Modified Capabilities

无。

## Impact

- 主进程启动：`src/main/bootstrap/index.ts` 的 `startApp()`、`bootstrapReady()` 及窗口聚焦协作。
- 测试：`test/main/bootstrap/index.spec.ts` 的 Electron app mock、启动顺序与第二实例场景。
- 工程约定：`guidelines/MainProcess.md` 和 `guidelines/DataMigrations.md` 需要记录单实例锁是所有启动期 app-data writer 与迁移的前置条件。
- 不新增依赖，不改变 renderer/preload IPC、持久化 schema、migration runner 语义或现有 project window identity。
