## 1. 定义并归一化子 Agent 数据契约

- [x] 1.1 在 `src/shared/types/stream-event.ts` 新增 `SubagentRunStatus`、`SubagentToolStats`、`SubagentRunSummary`，并为 `tool_call_start` / `tool_call_update` 增加可选 `subagent` 字段；字段必须保持全可选且不改变现有 `MessageChunkData` 判别联合，验收标准是 node/web typecheck 均能消费该同构类型。
- [x] 1.2 在 `src/main/services/session/chat/acp-mapper/agent-adapters/claude.ts` 实现 Claude Agent marker 与 `toolResponse` 白名单提取 helper：只识别 `_meta.claudeCode.toolName === "Agent"`，校验非空字符串和有限非负数字，只复制 design.md 列出的统计字段，不复制 `usage`、内部 `agentId` 或原始对象。
- [x] 1.3 扩充 `test/main/services/session/chat/acp-mapper/agent-adapters/claude.spec.ts`：使用 `data/logs/claude-subagent.log` 对应形态覆盖 start marker、rawInput Agent 类型、stats-only update、completed/failed 状态、非法数字/未知字段拒绝、MCP 字符串 `toolResponse` 忽略，以及非 Agent Claude 工具零变化。
- [x] 1.4 在 Claude adapter 中按原始顺序保留 Agent update 的全部标准 ACP 文本块，并以 `\n\n` 连接相邻块；不得解析或过滤供应商尾注，且测试须覆盖最新运行日志中的正文加尾注双 block、单 block 与非 Agent 多 block 不变。

## 2. 同步实时与持久化消息组装

- [x] 2.1 修改 `src/main/domain/session/chat/message-assembler.ts` 的 `toolMetadataFor` 和 tool update 分支，把 `subagent` marker/摘要增量合并到 `DynamicToolUIPart.toolMetadata.subagent`；仅含摘要的 update 必须触发替换，后续缺字段 update 不得清空统计、title、input、output 或延迟补到的 `parentToolCallId`。
- [x] 2.2 在 `test/main/domain/session/chat/message-assembler.spec.ts` 添加 stats-only 中间 update 后再 completed、toolStats 分字段合并、延迟 parent 关联、失败状态和空 marker 持久化用例；验收最终 `flush()` 消息可独立重建详情且不修改消息 metadata/session token。
- [x] 2.3 以相同合并语义修改 `src/renderer/src/composables/useUIMessageAssembler.ts`，并扩充 `test/renderer/src/composables/use-ui-message-assembler.spec.ts` 的镜像用例；验收实时 part 在 stats-only update 到达时更新，后续 completed update 保留摘要，且既有 live output 行为不回归。

## 3. 建立安全、可测试的 Renderer 投影

- [x] 3.1 新增 `src/renderer/src/utils/chatSubagent.ts`，实现并导出 `projectSubagentCalls(parts)`、根调用/后代投影类型、显示状态与 token/时长/toolStats 格式化函数；按同消息 ID 建图，保留原 part 顺序和 depth，不依赖连续性或工具标题。
- [x] 3.2 新增 `test/renderer/src/utils/chat-subagent.spec.ts`，覆盖显式 marker 无子工具、仅关系的旧消息、延迟关系、非连续子工具、并行根、嵌套后代、孤儿/跨消息引用、self-edge、cycle、重复 ID 与缺失统计；验收任何不安全边都保持普通工具可见且算法不会递归失控。

## 4. 实现父卡片与响应式详情 Slideover

- [x] 4.1 新增 `src/renderer/src/components/chat/message/SubagentCallCard.vue`：复用 `UiSurface`，以真实 button、可见 focus、`aria-expanded`、Agent/status badge 和可用摘要指标渲染；优先使用父 input `description` 作为标题，并根据 `SubagentRunSummary.status` 与当前 message stream 归属区分正在运行、完成、失败和已中断。
- [x] 4.2 新增 `src/renderer/src/components/chat/message/SubagentCallSlideover.vue`：使用全局 Nuxt UI overlay 样式与受控 open 状态，通过响应式 `message + rootToolCallId` 每次重新投影；分区展示 prompt、Agent 类型、resolved model、上游 metrics/toolStats、按 depth 的工具活动和 MarkStream 最终回复，并实现运行中等待、终态空态、缺失值、默认折叠的长输入输出及关闭焦点返回。
- [x] 4.3 修改 `src/renderer/src/components/chat/message/AssistantMessage.vue`：把 projector 根调用加入独立 `subagent-call` render item、在卡片前 flush 普通 `ChatToolGroup`、跳过且仅跳过安全连接的后代，同时传入整个响应式 message 和当前 stream indicator 归属；普通文本、reasoning、单工具和连续工具的现有顺序必须保持不变。
- [x] 4.4 在 `test/renderer/src/components/shared/ui-message-list.spec.ts`（必要时拆出镜像路径 `test/renderer/src/components/chat/message/subagent-call-*.spec.ts`）补充父卡片隔离分组、后代隐藏/孤儿保留、点击与键盘打开、实时新增工具/统计/结果、并行卡片隔离、状态文案、空态、长内容展开和关闭焦点返回测试；若新增 Nuxt UI 组件，按 `test/renderer/src/AGENTS.md` 在 `test/renderer/src/setup.ts` 增加有意义的 stub。
- [x] 4.5 微调子 Agent 父卡片视觉层级：使用表达分支执行节点的 Waypoints 图标，以 `input.description` 作为可换行的主名称并提升字号与字重，将放大的纯文本 Agent 类型和状态作为辅助信息且不显示冗余“子 Agent”文案；保持指标、点击、焦点及 Slideover 行为不变。

## 5. 回归验证

- [x] 5.1 运行与本变更直接相关的 main/renderer Vitest 文件，确认 Claude mapper、两套 assembler、projection 和组件场景全部通过；再运行 `pnpm exec vitest run --project main` 与 `pnpm exec vitest run --project renderer` 检查普通工具和其他 Agent 回归。
  - 验证记录：定向 91 项与 renderer 全量 649 项通过；main 全量 969 项中 968 项通过，唯一失败为未改动的 `acp-process-pool.spec.ts` 对既有 `MCP_CONNECTION_NONBLOCKING` workaround 的过时对象身份断言。
- [x] 5.2 运行 `pnpm typecheck`、`pnpm lint` 与 `git diff --check`；人工检查浅色/深色、窄/宽窗口、运行中更新、历史重载和键盘焦点。按项目约束不执行 `pnpm build`，除非用户在 Apply 阶段另行明确授权构建。
  - 验证记录：`pnpm typecheck`、`pnpm lint` 与 `git diff --check` 已通过；Browser plugin 不可用且仓库未安装 Playwright，尚未执行真实窗口的浅/深色与窄/宽截图检查。
