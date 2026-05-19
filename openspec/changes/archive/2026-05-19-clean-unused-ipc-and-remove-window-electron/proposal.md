## Why

当前 IPC 层同时承载真实业务能力、历史过渡通道和直接透出的 Electron bridge，已经出现代码、文档与 spec 漂移：部分 channel 在 renderer 无任何消费、部分 handler 仅返回空值、`window.electron` 仍向渲染进程暴露底层 bridge。继续保留这些入口会增加噪音，削弱“所有渲染层能力都通过按业务域设计的 `window.api` 暴露”的边界。

这次变更需要先把“哪些 IPC 仍是系统契约、哪些只是遗留实现”重新收口，再删除已无价值的 channel 和 bridge，降低后续实现与规范维护成本。

## What Changes

- **BREAKING** 删除一批已经无 renderer 调用、无当前产品价值、且不再承担过渡职责的 IPC channel，包括 chat 空壳入口、legacy integration tool-centric 通道、未使用的 settings 偏好入口、通用 `net:*` 代理通道，以及当前未接入 UI 的 `window:*` 通道。
- **BREAKING** 移除 preload 对 `window.electron`（`@electron-toolkit/preload` bridge）的暴露，统一要求渲染进程仅通过 `window.api` 访问主进程能力。
- 同步收紧 `electron/preload/index.d.ts`、相关 frontend 测试约定，以及 IPC / 架构 / 渲染层规范文档，消除与现状不符的描述。
- 为受影响的 OpenSpec capability 补 delta spec，明确哪些业务域仍然属于 IPC 覆盖范围、preload 暴露面的边界、以及 renderer 对底层 bridge 的禁止依赖。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ipc-protocol`: 更新 IPC 业务域覆盖范围与示例，删除已清理通道对应的契约表述，明确不再保留通用 `net` 业务域。
- `ipc-request-response`: 更新 preload 暴露边界，明确渲染进程只通过 `window.api` 访问能力，不再暴露 `window.electron` bridge；同步收紧对可保留领域 API 的要求。

## Impact

- `shared/types/channels.ts`
- `electron/main/ipc/*.ts`
- `electron/preload/index.ts`
- `electron/preload/index.d.ts`
- `electron/preload/api/*.ts`
- `frontend/src/api/*.ts`
- 依赖这些 API 的 stores / tests / mock
- `guidelines/IPC.md`
- `guidelines/Architecture.md`
- `guidelines/RendererProcess.md`
- `openspec/specs/ipc-protocol/spec.md`
- `openspec/specs/ipc-request-response/spec.md`
