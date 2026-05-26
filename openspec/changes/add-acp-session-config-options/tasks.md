## 1. Shared 类型与契约

- [ ] 1.1 在 `shared/types/acp-config.ts` 新建文件，导出 `AcpSessionConfigOptionValue`、`AcpSessionConfigOptionValueItem`、`AcpSessionConfigOptionGroup`、`AcpSessionConfigOptionCategory`、`AcpSessionConfigSelect`、`AcpSessionConfigBoolean`、`AcpSessionConfigOption`，结构与 `design.md` Decision 6 一致；不 import `@agentclientprotocol/sdk`。验收：`pnpm typecheck` 通过；该文件 import 列表为空（除 ts 内置 utility 外）。
- [ ] 1.2 在 `shared/types/chat.ts` 中给 `Session` 接口新增可选字段 `configOptions?: AcpSessionConfigOption[]`，从 `./acp-config` import 类型。
- [ ] 1.3 在 `shared/types/ipc.ts` 的 `MessageChunkData` 联合类型中新增 `{ kind: "config_options_update"; options: AcpSessionConfigOption[] }`。
- [ ] 1.4 在 `shared/types/channels.ts` 的 `ChatChannels` 中新增 `setConfigOption: "chat:setConfigOption"`。
- [ ] 1.5 在 `shared/schemas/ipc/chat.ts` 新增 `setConfigOptionInputSchema = z.object({...})`，使用 zod discriminated union 区分 `type: "select"` 与 `type: "boolean"`，验收：传入 `{ type: "boolean", value: "true" }` 时校验失败。
- [ ] 1.6 在 `shared/constants/error-codes.ts` 的 `IpcErrorCodes` 常量对象与 `IpcErrorCode` 类型中新增 `CONFIG_OPTION_NOT_SUPPORTED` 与 `CONFIG_OPTION_INVALID_VALUE`。
- [ ] 1.7 编写 `shared/__tests__/schemas/chat.spec.ts`（若已存在则追加）覆盖 `setConfigOptionInputSchema` 的成功与所有失败分支（缺字段、type/value 不匹配、value 空字符串）。

## 2. Main 进程：domain 与 mapper

- [ ] 2.1 在 `electron/main/domain/chat/session-events.ts` 的 `SessionEvent` 联合类型新增 `{ type: "config_options_update"; options: AcpSessionConfigOption[] }`，从 `@shared/types/acp-config` import。
- [ ] 2.2 在 `electron/main/domain/chat/acp-session-recovery.ts` 的 `shouldSuppressDuringReplay` 函数 switch 中新增 `case "config_options_update": return false;`，与 `available_commands_update` / `session_info_update` 同等待遇。验收：补充 `electron/main/__tests__/domain/chat/`（新建 `acp-session-recovery.spec.ts` 或扩展现有）覆盖该 case。
- [ ] 2.3 在 `electron/main/services/chat/acp-mapper.ts` 的 `mapSessionUpdate` 中新增 `case "config_option_update"`：把 `update.configOptions: SessionConfigOption[]` 通过新的 `normalizeAcpSessionConfigOptions` 辅助函数转成 `AcpSessionConfigOption[]`，返回 `{ type: "config_options_update", options }`。
- [ ] 2.4 在 `electron/main/services/chat/acp-mapper.ts` 中新增内部辅助 `normalizeAcpSessionConfigOptions(input)`：剥除 `_meta`、把 `null` category/description 归一为 `undefined`、保持 `select.options` 形态（平铺 vs 分组），同时导出供 `acp-session.ts` 复用。
- [ ] 2.5 扩写 `electron/main/__tests__/services/chat/acp-mapper.spec.ts` 覆盖 `config_option_update` 映射：包含平铺 select、分组 select、boolean 三种 fixture，断言剥除 `_meta` 与 `null` 归一化。

## 3. Main 进程：AcpSession 三处 emit

- [ ] 3.1 在 `electron/main/services/chat/acp-session.ts` 中新增私有方法 `emitConfigOptions(raw: SessionConfigOption[] | null | undefined)`：使用 `normalizeAcpSessionConfigOptions` 转换；`raw` 为空/null/undefined 时 emit `options: []`。
- [ ] 3.2 修改 `recoverSession` 中 `connection.newSession({ cwd, mcpServers })` 成功分支：在 emit `session_id_resolved` 之后调用 `this.emitConfigOptions(created.configOptions)`。
- [ ] 3.3 修改 `recoverSession` 中 `connection.resumeSession(...)` 成功分支：拿到响应后（当前代码丢弃返回值，需要把返回值赋给变量）调用 `this.emitConfigOptions(response.configOptions)`。
- [ ] 3.4 修改 `recoverSession` 中 `connection.loadSession(...)` 成功分支：拿到响应后调用 `this.emitConfigOptions(response.configOptions)`。注意 `runtimeState.suppressReplay === true` 时也要 emit（不被 replay 抑制）。
- [ ] 3.5 不在 `tryHandlePersistedSession` 的 direct prompt 成功分支主动 emit。
- [ ] 3.6 在 `electron/main/__tests__/services/chat/acp-session.spec.ts` 中为四个分支补充测试：newSession 含/不含 configOptions、resumeSession 命中、loadSession 命中、direct prompt 不主动 emit；断言 emit 的 `options` 是归一化后的结构。

## 4. Main 进程：config-option-service 与 IPC

- [ ] 4.1 在 `electron/main/services/chat/config-option-service.ts` 新建文件，导出 `setConfigOption({ projectId, sessionId, configId, type, value })`。函数体按 `specs/acp-chat-backend/spec.md#chat:setConfigOption IPC 在主进程封装 setSessionConfigOption` 的 6 步骤实现：(1) `resolveProjectPath` + `loadSessionMeta`；(2) 从 `meta.config_options` 取 schema，对 select 做 value 集合预校验，兼容 group/平铺 union；(3) `getOrStartProcess(meta.agentId)`；(4) `connection.setSessionConfigOption({ sessionId: meta.acpSessionId, configId, type? + value })`；(5) 错误归一为 `CONFIG_OPTION_NOT_SUPPORTED` / `ACP_ERROR`；(6) 通过 session-store 字段级更新写入 `config_options`，返回归一化后的 `AcpSessionConfigOption[]`。
- [ ] 4.2 实现"value 集合预校验"内部函数 `valueExistsInSchema(schema, value)`：`type === "boolean"` 直接通过；`type === "select"` 时遍历 `schema.options`，若元素含 `group` 字段，则递归查 `group.options`，否则比对 `value === item.value`。
- [ ] 4.3 在 `electron/main/services/chat/config-option-service.ts` 中识别 ACP "method not found" 错误：捕获 `Error & { code?: number | string }`，当 `code === -32601` 或 `code === "MethodNotFound"` 或 `message` 包含 `not implemented` / `unsupported` 时映射到 `CONFIG_OPTION_NOT_SUPPORTED`；否则 `ACP_ERROR`。
- [ ] 4.4 在 `electron/main/ipc/chat.ts` 的 `registerChatHandlers` 中注册 `ipcMain.handle(ChatChannels.setConfigOption, (_event, input) => wrapHandler(async () => { const form = validate(setConfigOptionInputSchema, input); return setConfigOption(form); }))`。
- [ ] 4.5 在 `electron/main/__tests__/services/chat/config-option-service.spec.ts` 新建测试覆盖：(a) 成功路径：service 写盘 + 返回 configOptions；(b) acpSessionId 缺失返回 `VALIDATION_ERROR`；(c) value 不在 select 集合返回 `CONFIG_OPTION_INVALID_VALUE` 且不调 RPC；(d) RPC 抛 `-32601` 映射 `CONFIG_OPTION_NOT_SUPPORTED`；(e) 其他 RPC 错误映射 `ACP_ERROR`；(f) group/平铺两种 schema 形态下 value 校验都正确。
- [ ] 4.6 在 `electron/main/__tests__/ipc/chat.spec.ts` 中补充 `chat:setConfigOption` handler 测试：(a) 入参校验失败返回 `VALIDATION_ERROR`；(b) 成功路径返回 `{ ok: true, data: { configOptions } }`。

## 5. Main 进程：session-store 与流式 chunk 转发

- [ ] 5.1 在 `electron/main/infra/storage/session-store.ts` 的 `SessionMeta` 接口新增可选字段 `config_options?: AcpSessionConfigOption[]`；在 `SessionMetaPatch` 与 `patchSessionMeta` 路径上确认字段级更新已支持新字段（无需特殊代码改动，但需在 fixture 与解析路径中确保字段不被误清）。
- [ ] 5.2 在 `electron/main/services/chat/chat-service.ts` 的 `toSession(meta, projectId)` 中把 `meta.config_options` 映射到 `Session.configOptions`。
- [ ] 5.3 在 `electron/main/services/chat/session-event-mapper.ts` 的 `toMessageChunk` switch 中新增 `case "config_options_update": return { kind: "config_options_update", options: ev.options };`。
- [ ] 5.4 扩写 `electron/main/__tests__/services/chat/session-event-mapper.spec.ts` 覆盖该映射。
- [ ] 5.5 在 `electron/main/ipc/chat.ts` 的 `chat:stream:message` handler 中，session 事件分派 switch 新增：
  ```ts
  case "config_options_update": {
    const chunk = toMessageChunk(ev);
    if (chunk) sink.sendChunk(chunk);
    enqueueSessionMetaPersist(
      { config_options: ev.options, updatedAt: new Date().toISOString() },
      "[chat] failed to persist session config options update"
    );
    break;
  }
  ```
  保持 switch 的穷尽检查（编译期）。
- [ ] 5.6 在 `electron/main/__tests__/ipc/chat.spec.ts` 中扩写 `chat:stream:message` 用例：当 `AcpSession` emit `config_options_update` 时，验证 sink 收到对应 chunk + session meta 落盘 patch 调用一次。
- [ ] 5.7 检查 `electron/main/ipc/proposal-apply.ts` 与 `electron/main/ipc/proposal.ts`（archive 路径）中的 session event switch：显式忽略 `config_options_update`，不转发不落盘；如已是穷尽 switch，新增 `case "config_options_update": break;` 注释说明"proposal 流不消费"。验收：`pnpm typecheck` 通过且单测中 proposal 流不会泄露该事件。

## 6. Preload 与 Renderer API 桥

- [ ] 6.1 在 `electron/preload/api/chat.ts` 中新增 `setConfigOption(input): Promise<IpcResponse<{ configOptions: AcpSessionConfigOption[] }>>`，调用 `ipcRenderer.invoke(ChatChannels.setConfigOption, input)`；同时确保 `MessageChunkData` 新分支在 `streamMessage` 的 `port.onmessage` 透传链路上无需改动（联合类型扩展即可）。
- [ ] 6.2 在 `electron/preload/index.d.ts` 中同步 `chat.setConfigOption` 的方法签名声明。
- [ ] 6.3 在 `frontend/src/api/chat.ts` 中新增 `setConfigOption(input): Promise<IpcResponse<{ configOptions: AcpSessionConfigOption[] }>>`，仅做 `window.api.chat.setConfigOption(input)` 转发。
- [ ] 6.4 在 `electron/main/__tests__/preload/` 下补充 `chat-preload.spec.ts`（若不存在）的 `setConfigOption` 转发测试。

## 7. Renderer：store 改造

- [ ] 7.1 在 `frontend/src/stores/session.ts` 中：
  - 在 `mergeSessionMeta(nextSession)` 中加入 `session.configOptions = nextSession.configOptions`。
  - 新增 action `setSessionConfigOptions(sessionId: string, options: AcpSessionConfigOption[])`：找到对应 session 后赋值；与 `setSessionAvailableCommands` 对称。
  - 在 store return 块中导出 `setSessionConfigOptions`。
- [ ] 7.2 在 `frontend/src/stores/chat.ts` 中：
  - 新增内存态 `pendingConfigIds = ref<Set<string>>(new Set())` 维护正在进行 setConfigOption 调用的 configId。
  - `streamSessionMessage.onChunk` 新增 `case "config_options_update"`：调用 `useSessionStore().setSessionConfigOptions(activeSession.id, data.options)`；保持 default 分支抛错的穷尽检查。
  - 新增 action `setConfigOption({ sessionId, configId, type, value })`：按 `specs/chat-interface/spec.md#chat store 提供 setConfigOption action 并支持乐观更新与回滚` 的 6 步骤实现（找 session、记录旧值、乐观更新、加入 pendingConfigIds、调 IPC、成功用响应替换 + 移除 pending、失败回滚 + toast + 移除 pending）。
  - 在 store return 块中导出 `setConfigOption` 与 `pendingConfigIds`（只读 computed）。
- [ ] 7.3 在 `frontend/src/__tests__/stores/chat.spec.ts` 中补充：
  - chunk `config_options_update` 触发 `setSessionConfigOptions`，正确替换全集。
  - `setConfigOption` 成功路径：乐观更新立即生效 → IPC 响应到达 → 全集替换 → pendingConfigIds 清空。
  - `setConfigOption` 失败路径：currentValue 回滚 + toast + pendingConfigIds 清空。
  - turn 中 server-push chunk 覆盖乐观值且不触发回滚。
- [ ] 7.4 在 `frontend/src/__tests__/stores/session.spec.ts` 中补充 `setSessionConfigOptions` 的基本用例。

## 8. Renderer：ConfigOptionsBar 组件

- [ ] 8.1 在 `frontend/src/components/chat/prompt/ConfigOptionsBar.vue` 新建组件：
  - props: 无（直接消费 `useSessionStore().activeSession?.configOptions` 与 `useChatStore().pendingConfigIds`）。
  - computed `sortedOptions`：按 `mode → model → thought_level → 其它` 优先级排序。
  - render: `v-if="(activeSession?.configOptions?.length ?? 0) > 0"`；外层包 `<Transition>` 提供 150ms 淡入位移过渡。
- [ ] 8.2 在 `frontend/src/components/chat/prompt/ConfigOptionItem.vue` 新建组件：
  - props: `option: AcpSessionConfigOption`、`isPending: boolean`、`@change(value)` emit。
  - `type === "select"`：渲染 `UDropdownMenu` + ghost-variant `UButton` 触发器；按钮显示 `option.name + currentValueLabel`；hover tooltip 显示 `option.description`；图标按 category 映射；`option.options` 为分组 union 时渲染分组菜单，否则渲染平铺菜单。
  - `type === "boolean"`：渲染 `USwitch + label`。
  - `isPending` 为 true 时禁用交互、显示 spinner。
- [ ] 8.3 在 `frontend/src/components/chat/prompt/ConfigOptionsBar.vue` 中遍历 `sortedOptions`，对每项渲染 `ConfigOptionItem`，并接 `@change` 调用 `useChatStore().setConfigOption({ sessionId: activeSession.id, configId: option.id, type: option.type, value })`。
- [ ] 8.4 在 `frontend/src/components/chat/prompt/ChatPromptPanel.vue` 的 footer 左侧动作区中，在 `<ChatAgentSelect />` 之后插入 `<ConfigOptionsBar />`。
- [ ] 8.5 在 `frontend/src/__tests__/components/` 下新建 `config-options-bar.spec.ts`：覆盖三类渲染条件（草稿态隐藏、非空渲染、空数组隐藏）；新建 `config-option-item.spec.ts` 覆盖 select 平铺、select 分组、boolean、未知 category fallback 图标。

## 9. Guidelines 与文档同步

- [ ] 9.1 在 `guidelines/IPC.md` 的 "Multimodal Prompt Channels" 段落之后新增小节，记录：
  - `chat:setConfigOption` 的入参/出参/错误码集合（`CONFIG_OPTION_NOT_SUPPORTED` / `CONFIG_OPTION_INVALID_VALUE` / `VALIDATION_ERROR` / `ACP_NOT_READY` / `ACP_ERROR`）。
  - `MessageChunkData` 的 `config_options_update` chunk 语义（全集替换；session_info_update / available_commands_update 同位治理；proposal 流不消费）。

## 10. 端到端验证与清理

- [ ] 10.1 运行 `pnpm typecheck` 与 `pnpm lint`，确保 shared 类型扩展、preload bridge 与 renderer api 全链路类型自洽。
- [ ] 10.2 运行 `pnpm vitest run electron/main/__tests__/services/chat/**/*.spec.ts electron/main/__tests__/ipc/chat.spec.ts electron/main/__tests__/domain/chat/**/*.spec.ts shared/__tests__/**/*.spec.ts frontend/src/__tests__/stores/chat.spec.ts frontend/src/__tests__/stores/session.spec.ts frontend/src/__tests__/components/config-options-bar.spec.ts frontend/src/__tests__/components/config-option-item.spec.ts`，全部用例通过。
- [ ] 10.3 启动 `pnpm dev`，使用支持 configOptions 的 ACP agent（如 `claude-code`）：
  - 草稿态进入 chat：footer 左侧不出现 ConfigOptionsBar。
  - 发送首条消息：等到 `newSession` 响应后 ConfigOptionsBar 渐显，渲染 mode/model/effort 选项；图标顺序为 shield-check → cpu → brain。
  - 切换 model 选项：UI 立即乐观更新 + spinner，IPC 响应到达后刷新；切到不存在的值在主进程被预校验拦截（构造测试用例时手动改 store 中 `Session.configOptions` 触发负路径）。
  - 重新打开同一 session：从持久化的 `config_options` 立刻渲染 Bar，无需等待第一次 turn。
- [ ] 10.4 移除调试代码、`console.log`、临时 fixture；确认 `electron/main/services/chat/acp-session.ts`（M 文件）的现有未提交修改与本次 task 改动一致后再交付。
