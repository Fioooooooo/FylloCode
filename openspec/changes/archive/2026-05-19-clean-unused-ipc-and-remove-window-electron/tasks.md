## 1. 收敛 channel 与 preload 暴露面

- [x] 1.1 更新 `shared/types/channels.ts`，删除已确认纳入清理范围的 channel 常量：`ChatChannels.getSession`、`ChatChannels.sendMessage`、`NetChannels.fetch`、`NetChannels.fetchImage`、`WindowChannels.*`，以及 legacy integration tool-centric 常量 `IntegrationChannels.listTools`、`getConnection`、`listProjectConfigs`、`setProjectConfig`、`yunxiaoSetToken`、`yunxiaoSetOrganization`。验收标准：文件中不再声明这些常量，保留的 channel 与本次 proposal 确认范围一致。
- [x] 1.2 更新 `shared/schemas/ipc/chat.ts`、`shared/schemas/ipc/integration.ts`、`shared/schemas/ipc/net.ts`、`shared/schemas/ipc/settings.ts`、`shared/schemas/ipc/window.ts`，删除仅服务于已移除 channel 的 schema；若某文件因此不再有有效导出，删除该 schema 文件并同步处理引用。验收标准：不存在只被已删除 handler 使用的 schema 残留。
- [x] 1.3 更新 `electron/main/ipc/chat.ts`、`integration.ts`、`settings.ts`、`window.ts`、`net.ts`，删除对应 handler；若 `window.ts`、`net.ts` 变为空模块，则删除文件，并在 `electron/main/ipc/index.ts` 移除对应 `register*Handlers()` 导入与注册。验收标准：全仓不再注册已删除 channel 的 `ipcMain.handle` / `ipcMain.on`。
- [x] 1.4 更新 `electron/preload/api/chat.ts`、`integration.ts`、`settings.ts`、`window.ts`、`net.ts`，删除对应方法；若 `window.ts`、`net.ts` 无剩余 API，则删除文件，并在 `electron/preload/index.ts` 与 `electron/preload/index.d.ts` 移除对应 `api.window` / `api.net` 暴露与类型。验收标准：`window.api` 上不再出现已删除的 domain 或 method。
- [x] 1.5 更新 `frontend/src/api/chat.ts`、`integration.ts`、`settings.ts`、`window.ts`、`net.ts`，删除对应包装方法；若 `window.ts`、`net.ts` 无剩余导出，则删除文件，并同步清理 `frontend/src` 中的导入、mock 和测试夹具。验收标准：`frontend/src/api` 只保留当前 renderer 真实消费的 API 包装。

## 2. 移除 `window.electron` bridge

- [x] 2.1 更新 `electron/preload/index.ts`，移除 `electronAPI` 导入、`contextBridge.exposeInMainWorld("electron", electronAPI)` 以及非隔离分支里的 `window.electron = electronAPI`。验收标准：preload 仅暴露 `window.api`。
- [x] 2.2 更新 `electron/preload/index.d.ts`，删除 `ElectronAPI` 导入和 `Window.electron` 类型声明，只保留 `Window.api: AppApi`。验收标准：renderer 类型系统中不再存在 `window.electron`。
- [x] 2.3 全仓检索并清理对 `window.electron`、`ElectronAPI`、原始 preload bridge 的引用，至少覆盖 `frontend/src/**`、`frontend/src/__tests__/**`、`guidelines/**`。验收标准：业务代码不存在 `window.electron` 运行时引用；测试说明若仍提到 bridge，仅保留历史说明且不要求实际 mock 该对象。

## 3. 同步 specs 与项目文档

- [x] 3.1 根据本 change 的 delta spec，更新 `openspec/specs/ipc-protocol/spec.md` 与 `openspec/specs/ipc-request-response/spec.md` 到归档前可接受的一致状态。验收标准：active spec 不再声明 `window.electron` 暴露或已删除 channel / 业务域。
- [x] 3.2 更新 `guidelines/IPC.md`，移除已删除 channel、已失效的 `project:create` / `project:getDefaultPath` / `settings:listAgents` 等文档漂移项，补齐保留域的真实清单，并把“事件订阅走 preload 封装”替代 `window.electron.ipcRenderer.on()` 的描述。验收标准：文档清单与 `shared/types/channels.ts`、preload API 一致。
- [x] 3.3 更新 `guidelines/Architecture.md` 与 `guidelines/RendererProcess.md`，将“渲染进程能力通过 `window.api / window.electron` 暴露”的表述收紧为仅通过 `window.api` 暴露，并维持“页面 / store 不得触碰原生 IPC”的规范。验收标准：项目文档对 renderer/public bridge 的描述与 preload 实现一致。

## 4. 验证与回归检查

- [x] 4.1 运行针对 IPC、renderer API 和相关 store 的测试，至少覆盖受影响模块已有测试；必要时补测试以确保删除后无残留依赖。验收标准：已存在的相关测试通过，且能捕获对已删除 API 的残留引用。
- [x] 4.2 运行 `pnpm typecheck`，确认移除 channel、preload API 和 `window.electron` 后主进程、preload、renderer 三层均无类型残留。验收标准：typecheck 通过，且不存在 `window.api.window` / `window.api.net` / `window.electron` 的引用错误。
