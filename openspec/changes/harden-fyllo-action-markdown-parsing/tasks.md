## 1. Shared Markdown 识别契约

- [ ] 1.1 在 `src/shared/fyllo-action/protocol.ts` 增加 `FylloActionMarkdownOccurrence`、`FylloActionMarkdownAnalysis` 及 candidate/literal 判别类型；字段必须包含原始区间、raw、attrs/body、closed、`sourceOrdinal` 和 disposition，且不得引入 Vue、Markstream 或 renderer 类型。
- [ ] 1.2 在 `src/shared/fyllo-action/parser.ts` 实现 `analyzeFylloActionMarkdown(source)` 的有限 Markdown lexical state machine：覆盖反引号/波浪号 fenced code、相同长度反引号 inline code、最多三个前导空格的顶层 standalone block、CRLF、闭合标签和所有 public opening-tag occurrence 的兼容 ordinal；保留 `parseFylloActionNode()` 作为 candidate 内部唯一 semantic validator。
- [ ] 1.3 扩展 `test/shared/fyllo-action/parser.spec.ts`，用表驱动用例验证 standalone candidate、inline/fenced code、正文前后缀、list、blockquote、多行 body、未闭合 final/streaming、CRLF、多 Action、重复 payload，以及 literal-before-candidate 时 `sourceOrdinal` 不压缩；验收标准是新 analyzer 对所有 spec 场景返回确定的 disposition 与原始源码区间。

## 2. Markstream 适配与字面内容保真

- [ ] 2.1 在 `src/renderer/src/features/fyllo-action/integration/markstream.ts` 定义 feature-owned render-only internal tag，并实现 `prepareFylloActionMarkdown()`：把 analysis 中 closed candidate 的 opening/closing tag name 改写为 internal tag；把代码区域之外的 literal occurrence 替换为 collision-checked opaque placeholder；保持 attrs/body、原始 session text 和已闭合 inline/fenced code 不变，并返回 candidate occurrence 与 placeholder source-range 映射。
- [ ] 2.2 在同一 integration 文件实现 `createFylloActionNodeTransformer()`：通过 markstream-vue 1.0.5 的 `parseOptions.postTransformNodes` 递归处理最终 AST，把 text-bearing node 中的 placeholder 替换为由 analysis 原始 raw 构造的普通 text node；不得依赖 parser 归一化后的 public-tag `content`/`raw`，不得修改 internal custom node，也不得执行 payload semantic validation。
- [ ] 2.3 重写 `createFylloActionOrdinalResolver()` 使其消费 shared analysis 和 internal rendered nodes，返回 candidate 的兼容 `sourceOrdinal`；删除 `integration/markstream.ts` 内独立的 public-tag 扫描正则，并覆盖重复 payload、节点 remount 和 candidate 前存在 literal occurrence 的稳定映射。
- [ ] 2.4 更新 `src/renderer/src/components/shared/MarkStream.vue`：computed 地生成 render-only content 与包含 `postTransformNodes` 的 parse options，只为 internal tag 调用 `setCustomComponents()` 和传递 `customHtmlTags`，在 content/id/action enablement 变化时重建 resolver，并继续把原始 content 用于 host identity；不得改动 smooth streaming、typewriter、batch rendering 参数。
- [ ] 2.5 更新 `src/renderer/src/features/fyllo-action/README.md` 的 Markstream integration 说明，记录 public 协议识别归 shared analyzer、internal tag 仅为 render transport、未闭合 occurrence 不进入 Action UI；不得把 internal tag 暴露为 feature public API 或 agent contract。
- [ ] 2.6 扩展 `test/renderer/src/components/fyllo-action-markstream.spec.ts`，并按需新增 `test/renderer/src/features/fyllo-action/markstream-integration.spec.ts`，覆盖真实 1.0.5 content-path AST 的 inline code、未闭合 backtick、fenced example、含直引号 JSON 的正文标签、line-start explanation、合法 standalone Action、混合 literal + Action 和流式 closing 切换；验收标准是 placeholder 不泄漏、非 candidate 不注册自定义节点且原始字符可见，candidate 仍交给 `FylloActionNode`。

## 3. Inline、EventRail 与 identity 收敛

- [ ] 3.1 更新 `src/renderer/src/features/fyllo-action/model/pending-actions.ts`，调用 `analyzeFylloActionMarkdown()` 并只解析 `disposition="candidate"` 的 occurrence；删除对 `collectFylloActionSources()` 的独立全量正则遍历，使用 occurrence 的 `sourceOrdinal` 构造 action ID。
- [ ] 3.2 更新 `src/renderer/src/features/fyllo-action/ui/fyllo-action-context.ts`、`FylloActionNode.vue` 及必要 host 类型，使 rendered internal node 只能从 resolver 获得 candidate ordinal；保持 `parseFylloActionNode()`、execution controller、registration/transition API 和 persisted state 读取行为不变。
- [ ] 3.3 扩展 `test/renderer/src/features/fyllo-action/event-rail.spec.ts`、`ui/fyllo-action-node.spec.ts` 和 `session-attention.spec.ts`：断言 literal occurrence 不产生 Inline 卡片、EventRail item、attention 或 registration，ready candidate 在 Inline/EventRail 使用相同 action ID，已有 persisted state 在 literal-before-candidate 场景仍能解析。

## 4. Agent Prompt 契约

- [ ] 4.1 更新 `src/shared/fyllo-action/prompt.ts` 的全局 rules，明确真实 Action 必须独占顶层 Markdown block，解释 public 标签或给出非执行示例必须使用 inline/fenced code；保持 registry 驱动顺序、`JSON.stringify` 示例和动态字段尖括号编码规则不变。
- [ ] 4.2 扩展 `test/shared/fyllo-action/prompt.spec.ts`（若当前文件名不同则更新现有 prompt 对应测试），断言 standalone block 与 literal-code 规则存在、输出仍确定、每个 registry example 仍可 JSON parse 并通过对应 payload schema。

## 5. 验证

- [ ] 5.1 运行 `pnpm exec vitest run --project main test/shared/fyllo-action` 和 `pnpm exec vitest run --project renderer test/renderer/src/features/fyllo-action test/renderer/src/components/fyllo-action-markstream.spec.ts`，修复所有 shared/renderer 回归并确认测试未依赖真实 Electron app。
- [ ] 5.2 运行 `pnpm typecheck`、`pnpm lint` 和 `git diff --check`；确认 feature 外部没有新增内部深路径导入、shared analyzer 无 Vue/Markstream 依赖、原始 assistant message 与 session meta 格式未改变。
