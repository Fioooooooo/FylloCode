## ADDED Requirements

### Requirement: MessageChunkData 包含 config_options_update 分支

`MessageChunkData` 联合类型 SHALL 新增 `config_options_update` 分支，用于流式协议在 turn 进行中传递 ACP 会话配置选项的全集替换。该分支结构 SHALL 为：

```typescript
{ kind: "config_options_update"; options: AcpSessionConfigOption[] }
```

`AcpSessionConfigOption` 类型由 `shared/types/acp-config.ts` 导出（脱 SDK 类型，不依赖 `@agentclientprotocol/sdk` 导入到 shared / preload / renderer）。

`session-event-mapper.toMessageChunk` SHALL 处理 `SessionEvent { type: "config_options_update", options }`，返回 `{ kind: "config_options_update", options }`，让 `chat:stream:message` handler 可以通过 `sink.sendChunk` 透传给 renderer。

所有消费 `MessageChunkData` 的 switch/分支 SHALL 处理 `config_options_update` 分支；TypeScript 穷尽检查 SHALL 在编译期发现漏处理。

#### Scenario: 接收 config_options_update chunk

- **WHEN** main 进程从 `AcpSession` 收到 `config_options_update` 事件，`options` 含 3 项
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "config_options_update", options: [<3 项>] } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "config_options_update", options })` 回调

#### Scenario: 空数组的 config_options_update 仍透传

- **WHEN** `AcpSession` emit `config_options_update` 且 `options.length === 0`
- **THEN** main 仍通过 port1 发送对应 chunk
- **AND** preload 仍触发 `onChunk`

#### Scenario: proposal 流不发送 config_options_update

- **WHEN** `proposal:stageStream` 或 `proposal:archive` handler 从其 `AcpSession` 收到 `config_options_update`
- **THEN** handler 显式忽略，不调用 `sink.sendChunk`
- **AND** renderer 不会从 proposal 流收到 `config_options_update` chunk

#### Scenario: shared 层 AcpSessionConfigOption 不依赖 SDK

- **WHEN** 审查 `shared/types/acp-config.ts` 的 import 列表
- **THEN** 不存在 `from "@agentclientprotocol/sdk"` 的运行时或类型 import
- **AND** 类型字段（`type` discriminator、`category` 开放枚举、`options` 平铺/分组 union）独立定义
