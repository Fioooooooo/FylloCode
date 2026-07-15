## Why

FylloCode 当前按标签名全局启用 markstream-vue 自定义节点，导致正文解释、代码示例以及流式阶段尚未闭合的 inline code 也可能被误送入 `FylloActionNode`。这不仅会吞掉或替换原始 Markdown，还可能让 Inline、EventRail 与持久化注册对同一段文本产生不同判断，因此需要把“什么是 Action 协议块”提升为明确、可测试的行为契约。

## What Changes

- 定义 Fyllo Action 的 Markdown 结构边界：只有位于代码区域之外、独占顶层 Markdown block 的协议标签才可成为 Action 候选；正文、inline code、fenced code 与带周边解释文字的示例一律按字面内容渲染。
- 定义流式识别边界：不完整前缀不得仅因标签名进入 Action 组件；只有达到协议候选的确定条件后才可展示 Action 状态，且只有完整、schema 合法的 `ready` Action 才能注册或进入 EventRail。
- 让 Inline 渲染、EventRail 收集和 action ordinal 解析复用同一个源码级识别结果，避免多套正则产生分叉；保持现有位置型 action ID 的源码 ordinal 兼容性，不迁移 session meta。
- 利用 markstream-vue 1.0.5 的 `parseOptions.postTransformNodes` 与自定义组件能力，在应用层用 render-only 占位符隔离非协议 occurrence，并在最终 AST 中按原始源码还原为普通文本；记录当前不需要 fork markstream-vue，以及未来何种能力缺口才值得推动上游扩展。
- 更新 agent-facing Fyllo Action prompt contract，要求真实 Action 独占 Markdown block，并要求解释标签语法时使用 inline/fenced code，降低协议文本与说明文本的歧义。

## Capabilities

### New Capabilities

- `fyllo-action-markdown-parsing`: 定义 Fyllo Action 在 Markdown、流式解析、Markstream 渲染、EventRail 投影和 action identity 中的统一识别边界。

### Modified Capabilities

- `fyllo-action-prompt-contract`: 增加真实 Action 必须独占 Markdown block、字面标签示例必须放入代码区域的 agent 输出约束。

## Impact

- Shared：`src/shared/fyllo-action/parser.ts` 及相关 protocol 类型将承担统一的源码 occurrence 分析与结构判定。
- Renderer：`src/renderer/src/components/shared/MarkStream.vue`、`src/renderer/src/features/fyllo-action/integration/markstream.ts`、`model/pending-actions.ts` 和 ordinal resolver 将改为消费同一分析结果。
- Prompt：`src/shared/fyllo-action/prompt.ts` 的静态契约文案将增加 Markdown 结构约束。
- 测试：补充 shared parser、Markstream 集成、Inline Node、EventRail 和 streaming 回归用例。
- 依赖与持久化：以已升级的 markstream-vue 1.0.5（stream-markdown-parser 1.0.9）为实现基线并只使用公开扩展点；不新增依赖，不修改 IPC、Action 状态机、session meta envelope 或 action ID 格式。
