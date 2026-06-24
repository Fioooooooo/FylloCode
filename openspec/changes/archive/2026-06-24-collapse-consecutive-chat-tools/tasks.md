## 1. toolKind metadata 组装与持久化

- [x] 1.1 修改 `src/main/domain/chat/message-assembler.ts#MessageAssembler.apply`：在 `tool_call_start` 新建 `DynamicToolUIPart` 时写入 `toolMetadata: { toolKind: ev.toolKind }`；在孤儿 `tool_call_update` 惰性建卡时，如果 `ev.toolKind` 是非空字符串则写入同样 metadata。
- [x] 1.2 修改 `src/main/domain/chat/message-assembler.ts#MessageAssembler.apply` 的 `tool_call_update` 替换逻辑：所有 `message.parts.splice(...)` 创建的新对象必须保留 `prev.toolMetadata`；若 update 携带有效 `toolKind` 且 `prev.toolMetadata?.toolKind` 缺失，可以补写，但不得用缺失值覆盖已有 metadata。
- [x] 1.3 修改 `src/renderer/src/composables/useUIMessageAssembler.ts`：按 1.1 / 1.2 的同一规则在渲染端流式内存消息中写入并保留 `toolMetadata.toolKind`。
- [x] 1.4 更新 `test/main/domain/chat/message-assembler.spec.ts`：覆盖 `tool_call_start` 写入 metadata、start 后 completed 更新保留 metadata、孤儿 update 写入 metadata、缺少 toolKind 的孤儿 update 不失败。
- [x] 1.5 更新 `test/renderer/src/composables/use-ui-message-assembler.spec.ts`：覆盖与 1.4 对等的渲染端组装行为。

## 2. 工具组 summary 与分组工具函数

- [x] 2.1 扩展或新增 `src/renderer/src/utils/chatTool.ts` 中的纯函数：`getToolKind(part)` 从 dynamic/static tool part 的 `toolMetadata.toolKind` 读取字符串，缺失、空字符串或未识别值返回 `"other"`。
- [x] 2.2 在 `src/renderer/src/utils/chatTool.ts` 中新增 `summarizeToolGroup(parts)`：按组内首次出现的 kind 顺序统计，并生成英文文案；映射必须满足 `read -> Read x file(s)`、`write -> Write x file(s)`、`edit -> Edit x file(s)`、`search -> Search x tool(s)`、`execute -> Run x command(s)`、`other -> Run x tool(s)`。
- [x] 2.3 新增或扩展 `test/renderer/src/utils/chat-tool.test.ts`（若不存在则创建）：覆盖 `Read 1 file, Write 1 file`、`Run 2 tools`、`Read 2 files, Run 1 tool`、未知 kind fallback、按首次出现顺序输出。

## 3. AssistantMessage 渲染分组

- [x] 3.1 修改 `src/renderer/src/components/chat/message/AssistantMessage.vue`：不要直接在 template 中对 `props.message.parts` 使用单层 `v-for` 渲染；新增 computed render items，扫描原始 parts 并保留每个 item 的原始 `partIndex`。
- [x] 3.2 在 3.1 的分组算法中实现：相邻 tool part 数量 `>= 2` 时产出 `tool-group` item；单个 tool part 仍产出普通 `part` item；任意非 tool part 打断工具组；不得修改 `props.message.parts`。
- [x] 3.3 调整 `AssistantMessage.vue` 的 text part 分支：调用 `buildActionContext(item.partIndex)`，不得使用 render item 的 `v-for index`。验收：`[text, tool, tool, text]` 中第二个 text 的 action context partIndex 仍为 `3`。
- [x] 3.4 保持单个 tool part 的现有渲染：仍使用 `UChatTool`、`isToolStreaming(part)`、`getToolText(part)`、`getToolSuffix(part)`、`getToolOutput(part)`。

## 4. 工具组 UI 组件

- [x] 4.1 新增 `src/renderer/src/components/chat/message/ChatToolGroup.vue`（或等价局部组件）：props 接收 `{ part, partIndex }[]`，折叠态展示 `summarizeToolGroup` 生成的 summary，并提供展开/收起交互。
- [x] 4.2 `ChatToolGroup.vue` 折叠态样式应接近 `UChatTool`：使用项目现有 design token（如 `bg-elevated`/`border-default`/`text-muted`/`rounded-lg`），使用 chevron icon 表示状态；展开状态仅为组件本地状态。
- [x] 4.3 `ChatToolGroup.vue` 展开后按原始顺序渲染每个工具，并复用 `UChatTool` + `getToolText` / `getToolSuffix` / `getToolOutput`；不得为展开细节重新实现工具输出格式。
- [x] 4.4 若工具组内任一 tool 正在 streaming，组 header 应体现 streaming 状态（复用 `isToolStreaming(part)` 聚合结果），但不得改变单个工具的 streaming 判定。

## 5. 渲染测试

- [x] 5.1 更新 `test/renderer/src/components/shared/ui-message-list.spec.ts` 或新增 `test/renderer/src/components/chat/message/assistant-message.spec.ts`：覆盖连续两个 tool 折叠为一个工具组，summary 为 `Read 1 file, Write 1 file`。
- [x] 5.2 覆盖工具组展开后显示两个原始工具详情，且仍能看到 `getToolOutput` 返回的 output。
- [x] 5.3 覆盖历史消息缺少 `toolMetadata` 时 summary 为 `Run 2 tools`，展开后仍展示原工具详情。
- [x] 5.4 覆盖单个 tool 不折叠、`tool text tool` 不跨 text 分组。
- [x] 5.5 覆盖 Fyllo action `partIndex` 不变：构造 `[text(action-a), tool(read), tool(write), text(action-b)]`，断言两个 `MarkStream` stub 收到的 `actionContext.partIndex` 分别为 `0` 和 `3`。

## 6. 文档与验证

- [x] 6.1 更新 `guidelines/DataModel.md` 的 Chat message 持久化说明：记录新生成 assistant `dynamic-tool` part 可包含 `toolMetadata.toolKind`，该字段为兼容性新增、历史消息可缺失、无需迁移。
- [x] 6.2 运行 `pnpm vitest run test/main/domain/chat/message-assembler.spec.ts test/renderer/src/composables/use-ui-message-assembler.spec.ts test/renderer/src/components/shared/ui-message-list.spec.ts`；若新增了其他测试文件，一并加入命令。
- [x] 6.3 运行 `pnpm typecheck`。
- [x] 6.4 运行 `pnpm lint`。
