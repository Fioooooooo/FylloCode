## Context

`src/renderer/src/components/shared/MarkStream.vue` 当前在启用 Action 时把 public Fyllo Action 标签名加入 markstream-vue 的 `customHtmlTags`，并通过 `setCustomComponents()` 将该标签映射到 `FylloActionNode`。`customHtmlTags` 是消息级标签名白名单，不提供按 occurrence、Markdown 父节点、源码区间或 payload schema 判定的 predicate；因此同一 text part 中的正文说明、代码示例和真实 Action 会共享同一处理规则。

项目当前已升级到 markstream-vue 1.0.5，底层为 stream-markdown-parser 1.0.9。该版本公开 `parseOptions.postTransformNodes`，并保证该 hook 在 `MarkdownRender` 的 content path 中收到最终 AST。实测表明，完整 inline code 与 fenced code 中的 public 标签会分别保持为 `inline_code` 与 `code_block`；但一旦把 public 标签加入 `customHtmlTags`，正文中的闭合标签、尚未闭合的 inline-code 前缀和行首未闭合标签仍可能生成自定义节点，且流式预处理仍会插入换行或自动闭合。新版因此可以把适配从 token 重写简化为最终 AST 重塑，但不能替代原始源码级的 occurrence 判定。

另一个实测约束是：仅把 public 标签的尖括号转义为 HTML entity 虽然能阻止自定义节点解析，但普通文本仍会经过 typographer，JSON 与属性中的直引号可能变为弯引号。字面示例必须从 original analysis 的源码区间还原，不能把 parser 归一化后的 `content` 或 `raw` 当作无损来源。

此外，`src/shared/fyllo-action/parser.ts`、`src/renderer/src/features/fyllo-action/integration/markstream.ts` 和 `model/pending-actions.ts` 当前分别扫描 Action 标签。它们都按标签名或正则 occurrence 工作，无法保证 Inline、EventRail 与 action identity 对 Markdown 上下文作出相同判断。

## Goals / Non-Goals

**Goals:**

- 建立一个纯源码级、与 Vue/Markstream 无关的 Fyllo Action occurrence 分析结果，明确区分协议候选和字面内容。
- 只有位于代码区域之外、独占顶层 Markdown block 且已闭合的标签块才能进入 `FylloActionNode`；候选内部继续复用现有 type、attribute、JSON 和 Zod schema 校验。
- 让 Inline 渲染、EventRail 投影和 action ordinal 使用同一分析结果。
- 使用 markstream-vue 1.0.5 的公开扩展点完成适配，并记录未来修改或推动上游扩展的触发条件。
- 保持现有 action ID 格式和历史源码 ordinal，不迁移 session meta。

**Non-Goals:**

- 不修改 Fyllo Action payload schema、registry、执行 controller、IPC、Main 状态机或持久化 envelope。
- 不把 Action 改造成 tool call、独立 message part 或其他 out-of-band transport。
- 不 fork、patch-package 或在当前 1.0.5 基线上继续升级 markstream-vue，也不新增 Markdown parser 依赖。
- 不建立通用 Markdown AST 框架；源码分析器只覆盖识别 Fyllo Action 所需的 fenced code、inline code、顶层 block 和标签边界。

## Decisions

### 1. Shared 源码分析器是唯一识别事实源

在 `src/shared/fyllo-action/parser.ts` 增加 `analyzeFylloActionMarkdown(source)`，并在 `protocol.ts` 定义 `FylloActionMarkdownOccurrence` 与 `FylloActionMarkdownAnalysis`。每个 occurrence 至少包含：原始源码区间、raw、attrs/body、是否闭合、`sourceOrdinal` 和 `disposition: "candidate" | "literal"`。

分析器使用小型 Markdown lexical state machine：

- 按 CommonMark fence 基本规则识别最多三个前导空格后的反引号或波浪号 fence，并忽略 fence 内 occurrence；
- 在非 fence 内容中按相同长度反引号 run 识别 inline code span，并把已闭合或流式未闭合 span 内 occurrence 标为 literal；
- public opening tag 必须位于文件开头或空白行之后，行首只能有最多三个空格；对应 closing tag 后至当前 Markdown block 结束只能有空白，且后续为文件结尾或空白行；因此 list、blockquote、正文前后缀和内联示例均不构成 candidate；
- candidate 的 body 可以跨行；attrs、JSON 与 payload schema 不在结构分析阶段判定，确保独立但格式错误的协议块仍进入现有 invalid UI；
- `sourceOrdinal` 继续按原始 text part 中所有 public opening-tag occurrence 的源码顺序编号，包括 literal occurrence，以保持现有正则 ordinal 对历史 action ID 的兼容。

选择源码 state machine 而不是直接依赖 Markstream token，是因为 EventRail model 必须保持纯净且不能依赖 Vue/第三方宿主，且 Markstream 在 hook 前已经改变部分源码形状。选择有限 lexical scanner 而不是完整 Markdown parser，是为了不引入依赖，并将复杂度限制在本协议的结构边界。

### 2. 完整闭合后才把 occurrence 提交给 Action 渲染

流式前缀可能同时是真实 Action 或尚未结束的代码/解释文本；在未来字符到达前，两者无法被任何 parser 无歧义地区分。因此未闭合 occurrence 一律不进入 `FylloActionNode`、不注册 ready state、也不进入 EventRail。它在当前流式帧中按字面 Markdown 展示；closing tag 到达并满足独立 block 约束后，才切换为 Action candidate。

这会移除现有基于标签名的 pending Action 卡片，但换取确定性：解释性 inline code 不会在右反引号到达前短暂闪现 Action UI。若未来产品必须恢复未闭合 Action 的专属 pending UI，需要先引入 out-of-band 信号或接受前缀误判，作为独立行为变更处理。

### 3. 使用 render-only 内部标签和占位符隔离 public 协议与 Markstream 白名单

`src/renderer/src/features/fyllo-action/integration/markstream.ts` 新增 `prepareFylloActionMarkdown()` 和 `createFylloActionNodeTransformer()`：

1. 读取 shared analysis；
2. 只在 render-only content 中把 candidate 的 public tag name 改写为 feature-owned internal tag name，attrs 与 body 保持不变；原始 session message 不修改；
3. 对代码区域之外的 literal occurrence，在 render-only content 中用本次转换生成、且已确认不与原文冲突的 opaque placeholder 替换整个 occurrence；placeholder map 保存对应 analysis source range 与原始 raw。已闭合 inline/fenced code 中的 literal 不改写，继续由新版 parser 生成原生 code node；
4. `MarkStream.vue` 只把 internal tag 加入 `customHtmlTags`，并只为 internal tag 注册 `FylloActionNode`；public 标签永不进入自定义标签白名单；
5. `parseOptions.postTransformNodes` 递归遍历最终 AST，把 text-bearing node 中的 placeholder 替换为使用 analysis 原始 raw 构造的普通 `text` node。转换不得依赖 parser 已归一化的 public-tag `content`/`raw`，也不得执行 payload semantic validation；
6. internal tag node 继续把 attrs/content 交给 `parseFylloActionNode()`，不把 internal tag、placeholder 或其他 render transport metadata 加入 public payload contract。

内部标签隔离优于继续把 public 标签名全局加入 allowlist：只有 shared analyzer 已批准的 candidate 才可能生成 Action node。opaque placeholder 则使 literal occurrence 在 HTML-like parsing 和 typographer 运行期间不再表现为标签或 quote-sensitive payload，最终由 `postTransformNodes` 从原始 source range 无损还原。这样安全边界不依赖 AST occurrence 猜测，也不耦合 MarkdownIt token 的 `map`、`content` 或 `children` 形状。

### 4. Inline、EventRail 与 identity 复用 analysis

- `MarkStream.vue` 每次 `content` 或 streaming state 变化时基于当前原始 content 生成 render-only content、parse options 与 ordinal resolver。
- `createFylloActionOrdinalResolver()` 接收 analysis，并把 internal rendered node 映射回 candidate 的 `sourceOrdinal`；不得重新运行独立正则。
- `collectPendingFylloActions()` 调用同一 analyzer，只对 `disposition="candidate"` 且 `parseFylloActionNode()` 返回 ready 的 occurrence 建立投影。
- `FylloActionNode` 继续只负责候选内部的语义校验、UI 和 execution controller，不承担 Markdown 上下文恢复。

这保持 `model → @shared` 与 `integration → Markstream` 的现有 feature 依赖方向，也避免 EventRail model 引入宿主 token 类型。

### 5. 更新 prompt，但不把 prompt 当作防御边界

`renderFylloActionPromptContract()` 增加两条全局规则：真实 Action 必须独占 Markdown block；解释 public 标签或给出示例时必须使用 inline/fenced code。Renderer 仍必须正确处理不遵守 prompt 的第三方 agent、历史消息和异常输出。

### 6. 当前不修改 markstream-vue

1.0.5 的公开能力足以完成适配：`customHtmlTags` 负责 internal tag 的 streaming AST，`setCustomComponents` 负责 Vue 映射，`postTransformNodes` 负责在 content path 的最终 AST 中还原 literal placeholder。预解析 `nodes` 方案被否决，因为它会绕过当前 content-mode 的 smooth streaming/typewriter 管线，并要求 FylloCode 复制更多 Markstream AST 装配职责；token hooks 也不再需要，因为 candidate/literal 边界和原始 raw 都已在 parser 之前由 shared analysis 确定。

未来满足以下任一条件时，应重新评估修改、升级或向上游贡献 markstream-vue：

- `postTransformNodes` 不再应用于 `MarkdownRender` 的 content path，或无法稳定重塑 nested text-bearing nodes；
- internal custom tag 在 streaming normalization 中仍会跨 Markdown block 吞内容；
- 项目出现第二种需要按 occurrence predicate 注册的协议节点，应用层适配开始重复；
- markstream-vue 提供稳定的 `customHtmlTagFilter(node, sourceContext)` 或等价 API，可替代 render-only internal tag、placeholder 与 node transformer。

不选择“只更新 prompt”，因为无法覆盖第三方 agent 和历史内容；不选择“只在 `FylloActionNode` 校验”，因为到达 Node 时 Markdown 已被宿主吞并；不选择 HTML entity 转义，因为 typographer 会改变 quote-sensitive 字面 payload；不选择直接按 parser node.raw 猜测 public occurrence，因为 streaming normalization 已可能改变其换行和引号；不选择增加 public `intent` 属性，因为解释文本仍可复制相同属性，且会无必要地扩展协议。

## Risks / Trade-offs

- **[Risk] 有限 Markdown state machine 与 CommonMark 边缘语法不完全一致** → 只承诺 spec 中列出的 fence、inline code、顶层独立 block 规则；用表驱动测试覆盖反引号 run、波浪号 fence、列表、blockquote、CRLF、多 Action 和流式增长，不尝试泛化为完整 parser。
- **[Risk] render-only content 重写导致 ordinal 或节点匹配漂移** → `sourceOrdinal` 只来自原始 content analysis，internal tag 不携带业务 identity；Inline resolver 和 EventRail 使用同一 occurrence 列表，并加入重复 payload 与 literal-before-candidate 回归测试。
- **[Risk] 未闭合真实 Action 在流式阶段短暂显示协议文本** → 这是 commit-on-close 的明确取舍；不注册、不产生卡片和副作用，closing 到达后原位切换。若视觉体验不可接受，另提 out-of-band pending 信号方案。
- **[Risk] markstream-vue 内部预处理或 AST 形状在升级后变化** → 集成测试直接覆盖 internal tag 映射、placeholder 穿过 content path 后的 `postTransformNodes` 还原及 literal preservation；依赖升级时这些测试作为是否需要上游改造的判据。
- **[Risk] 既有消息的已持久化状态找不到对应 Action** → ordinal 继续计入 candidate 前的 literal public opening tag，保持当前源码顺序；不重写历史消息或 session meta。

## Migration Plan

1. 先增加 shared analyzer 与表驱动测试，验证旧合法 Action 的 `sourceOrdinal` 不变。
2. 在 Markstream integration 增加 render-only internal tag、literal placeholder 与 node transformer，再切换 `MarkStream.vue`，保持原始 message content 不变。
3. 将 ordinal resolver 和 EventRail collector 切换到 shared analysis，删除重复扫描正则。
4. 更新 prompt contract 及测试，运行 renderer/main 相关测试、typecheck 和 lint。
5. 本变更无数据迁移；回滚时恢复旧 adapter 与 collector 即可，既有 session meta envelope 和 records 无需回退。

## Open Questions

无。实现阶段不得在未重新提案的情况下恢复“未闭合标签即显示 pending Action”的旧语义。
