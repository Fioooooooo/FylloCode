## Context

Fyllo Action 在 `75c1dee8 fix(fyllo-action): harden markdown action recognition` 中建立了两层防线：

1. `src/shared/fyllo-action/parser.ts` 在 Markstream 之前按原始 Markdown 源码判定 fenced/inline code、standalone block、closing tag、literal 和 candidate；
2. `src/renderer/src/features/fyllo-action/integration/markstream.ts` 只把 candidate 改写为 render-only internal tag，并用 collision-free placeholder 让 literal occurrence 无损穿过 Markstream AST。

这套结构规则适用于 Fyllo Signal，但当前实现把 public/internal tag 名称、placeholder namespace 和 Action 类型写死在模块中。直接复制会使两套规则漂移；建立通用协议框架又超出本次轻量需求。Signal 同时新增 agent-facing 标签、Chat system-reminder、Markstream 渲染和 type UI，因此需要一个最小的共享抽取，并将 renderer 实现放入用户指定的 `src/renderer/src/features/fyllo-signal/`。

现有 Action 由 `ChatMessageList.vue` 以 `props.type === "chat"` 显式传入 `AssistantMessage.vue`，再由后者只在 assistant text part 上启用 `MarkStream.vue` 的 Action adapter。Signal 沿用相同 Chat 边界，但不依赖 project/session/action context。

## Goals / Non-Goals

**Goals:**

- 新增 `<fyllo-signal type="...">` 被动展示协议，并以 `show.time` 接通完整生产链路。
- 让 Action 和 Signal 使用同一份 Markdown structural analyzer 与 Markstream literal/candidate transport。
- 将共用解析行为归入 `markstream-custom-tag-parsing` capability，使未来新增的 agent-facing MarkStream 自定义标签沿用并扩充同一规范。
- 保持 Fyllo Action 的 public API、candidate 判定、source ordinal、注册、状态、EventRail 和持久化行为不变。
- 只在 Chat 的 assistant text part 中启用 Signal。
- 让 `FylloSignalShell.vue` 只承担容器责任；每个 type 组件独立拥有视觉和交互。
- 让 Signal prompt contract 与 Action 共用 standalone block、前后空行、literal 示例和尖括号编码规则。

**Non-Goals:**

- 不为 Signal 增加 IPC、Main service、identity、状态机、独立持久化、确认按钮或 EventRail contributor。
- 不恢复未闭合标签的可见 pending 卡片或骨架。
- 不修改 markstream-vue，不引入新的 Markdown parser 或其他第三方依赖。
- 不把所有 agent 输出协议统一成可插拔框架，也不为尚不存在的 Signal type 预建 application/model 层。
- 不保证 `show.time` 永久保留；在本变更中它是正常启用且按真实契约实现的 type，未来删除时另行修改契约。

## Decisions

### 1. 抽取最小的 shared tag analyzer，semantic parser 仍归各协议所有

新增 `src/shared/fyllo-markdown/tag-analysis.ts`，导出：

- `FylloTagMarkdownContext`
- `FylloTagMarkdownDisposition`
- `FylloTagMarkdownOccurrence`
- `FylloTagMarkdownAnalysis`
- `analyzeFylloTagMarkdown(source, { tagName })`

该模块承接当前 `src/shared/fyllo-action/parser.ts` 中以下纯结构逻辑：源码行收集、fenced code range、inline code range、opening tag/attribute 扫描、closing tag 定位、最多三空格、前后空行、candidate/literal 和 source ordinal。`tagName` 只接受不含尖括号的 public tag name，例如 `fyllo-action` 或 `fyllo-signal`。

`analyzeFylloActionMarkdown()` 保留原函数名和返回形状，改为调用 generic analyzer；`FylloActionMarkdown*` 类型通过显式 type alias 保持现有消费者兼容。`src/shared/fyllo-signal/parser.ts` 用相同 helper 实现 `analyzeFylloSignalMarkdown()`。

Action 与 Signal 的 `parseFyllo*Node()`、registry lookup、错误文案和 Zod payload validation 不进入 generic analyzer。这样共享的是已确认相同的 Markdown 结构规则，而不是把两个业务协议强行合并。

备选方案是复制 Action parser。该方案实现快，但相同规则和测试会长期重复，且此前 Action 优化设计已把“出现第二种 occurrence 协议”列为重新抽取的触发条件，因此不采用。

OpenSpec 中的共用规则归入 `markstream-custom-tag-parsing`，而不是 Signal 专属 capability。该 capability 只规定进入 MarkStream custom node 前必须满足的结构边界、流式提交和 literal 保真；每种标签的 type、payload、状态与 UI 继续由各自 capability 定义。未来新增自定义标签时，应扩充该 spec 的通用规则或增加该标签对应场景，不再新建一份重复的 Markdown parsing spec。

### 2. 抽取 Markstream render transport，Action 专属流程留在 feature

新增 `src/renderer/src/components/shared/markstream/fyllo-tag.ts`，导出：

- `prepareFylloTagMarkdown(source, analysis, config)`
- `createFylloTagNodeTransformer(prepared, config)`
- 对应的 prepared result、literal placeholder 和 config 类型

`config` 只包含 `publicTagName`、`internalTagName` 和 `placeholderNamespace`。helper 负责：

- 仅将 `disposition="candidate"` 的 public tag 改写成 internal tag；
- 让 inline/fenced code 继续走 Markstream 原生 code path；
- 用 collision-free placeholder 替换 Markdown 正文中的 literal occurrence；
- 在 `postTransformNodes` 中从 analysis 保存的原始 `raw` 恢复 literal；
- 不执行 semantic validation、registration、identity 或 UI 选择。

`src/renderer/src/features/fyllo-action/integration/markstream.ts` 保留现有 public exports，并用 generic helper 实现 `prepareFylloActionMarkdown()` 与 `createFylloActionNodeTransformer()`；registration 和 ordinal resolver 继续留在 Fyllo Action feature。

`src/renderer/src/features/fyllo-signal/integration/markstream.ts` 提供 Signal wrapper，internal tag 固定为 `fyllo-signal-render`。Signal 不需要 ordinal resolver 或 registration。

`MarkStream.vue` 在 Action 开启时先处理 Action，再在 Signal 开启时处理当前 render-only content；合并 internal custom tag 数组、一次性调用 `setCustomComponents()` 注册全部启用组件，并把两个 node transformer 按准备顺序组合到单个 `postTransformNodes`。混合测试必须证明两个 candidate 都能渲染、两类 literal 都保持原文、Action ordinal 不变。

备选方案是建立一次扫描多个协议的统一 registry。当前只有两个固定标签，顺序组合更直接，也不会扩大成新框架，因此不采用多协议 registry。

### 3. Signal feature 使用 ui + integration 最小结构

在 `src/renderer/src/features/fyllo-signal/` 创建：

```text
README.md
index.ts
ui/
  FylloSignalNode.vue
  FylloSignalShell.vue
  renderer-registry.ts
  signals/ShowTimeSignal.vue
integration/
  index.ts
  markstream.ts
```

`README.md` 记录范围、非范围、公开入口和 Markstream integration 入口，满足 Renderer Feature guideline。Signal 具有第三方 Markstream 宿主适配，因此符合 feature 准入；但没有状态机或用例编排，不创建 `model/` 和 `application/`。

`renderer-registry.ts` 只维护 `type -> component` 映射，不定义统一 `title`、`icon`、`clickable` 或 presentation metadata。`FylloSignalShell.vue` 输出无视觉 class 的容器、必要的 `data-fyllo-signal-type`/host passthrough 和 slot；它不提供边框、背景、图标、hover、click handler 或按钮。`ShowTimeSignal.vue` 自行实现时钟图标、紧凑 pill 和 `label` 展示。

closed candidate 若 semantic validation 失败，由 `FylloSignalNode.vue` 在 Shell 内显示非交互的通用 invalid 文本与 parser details；invalid fallback 不调用 type component。该 fallback 是协议诊断，不把样式责任重新放回 Shell。

### 4. 未闭合 Signal 没有可见 pending 状态

generic analyzer 只把已闭合且满足 standalone block 的 occurrence 标记为 candidate。未闭合 Signal 在 streaming 和 final 状态都保持 literal Markdown，不进入 internal custom tag，也不创建 `FylloSignalNode`。

Signal semantic parse result 只需要 `ready | invalid`。不增加 pending UI 或骨架。Fyllo Action 现有 `pending` 类型和 Shell 分支为兼容保留，但优化后的 Markstream content path仍维持 commit-on-close，不恢复旧行为。

### 5. Chat 显式开启且只覆盖 assistant text part

`ChatMessageList.vue` 向 `AssistantMessage.vue` 传递 `:enable-signals="props.type === 'chat'"`。`AssistantMessage.vue` 只在 `isTextUIPart(item.part)` 分支把该布尔值传给 `MarkStream.vue`。

`MarkStream.vue` 增加可选 `enableSignals` prop。Signal 不依赖 `buildActionContext()`；即使 Action 因 project/session context 不完整而关闭，Chat 仍可独立开启 Signal。其他直接使用 `MarkStream.vue` 的 Specs、Guidelines、Knowledge、Proposal 和 Subagent inspector 不传此 prop，因此保持关闭。

### 6. Prompt contract 共用格式构造，Signal 保留自身语义

新增 `src/shared/fyllo-markdown/prompt-contract.ts`，提供通用字段描述和 formatter，用于生成：

- strict JSON body；
- 唯一 `type` 属性；
- `\u003c` / `\u003e` 尖括号编码；
- standalone top-level block；
- opening tag 前空行与 closing tag 后空行；
- inline/fenced code 中的 literal 示例；
- 通过 `JSON.stringify` 生成的 per-type example。

`src/shared/fyllo-action/prompt.ts` 改为调用 helper，现有 `renderFylloActionPromptContract()` 输出必须保持 byte-for-byte 一致。`src/shared/fyllo-signal/prompt.ts` 用同一 helper 生成 `<fyllo-signal-contract>`，再加入“被动展示、无需用户操作、不进入 EventRail”的 Signal 专属规则。

`src/main/services/session/chat/system-reminder/providers/chat.ts` 在现有 Action contract 后追加 Signal contract。两个 section 都只由 shared prompt renderer 生成，provider 不复制规则或 type 文案。

### 7. `show.time` 作为真实启用 type

`FylloSignalType` 首版为 `"show.time"`。payload 为：

```ts
interface ShowTimeSignalPayload {
  label: string;
}
```

schema 使用 `z.strictObject({ label: z.string().min(1).max(200).regex(/^[^\r\n]+$/) })`，避免多行 label 破坏紧凑展示。prompt 说明 agent 在用户询问当前时间时输出一次 Signal。`ShowTimeSignal.vue` 自行提供时钟图标和 pill 样式，Shell 不参与视觉定义。

虽然该 type 主要用于串联完整流程，本次不增加 dev-only flag、测试旁路或自动过期机制；后续删除按普通 contract 变更处理。

## Risks / Trade-offs

- **[Risk] 抽取 generic analyzer 时改变 Action source ordinal 或 candidate 边界** → 保留 `analyzeFylloActionMarkdown()` public wrapper，先把现有 Action parser 表驱动测试迁移到 generic helper，并用既有 Action Markstream、registration 和 persisted identity 测试阻止行为漂移。
- **[Risk] Action/Signal 两次 render-only 预处理或 transformer 组合互相覆盖** → 使用不同 internal tag 与 placeholder namespace，并增加同一 text part 同时包含 ready/literal Action 和 Signal 的集成测试。
- **[Risk] 无样式 Shell 导致 type 之间视觉不一致** → 这是允许 type 自主表达的明确取舍；只要求 type UI 遵守现有 UiDesign 语义 token、focus 和 motion 规范。
- **[Risk] 未闭合真实 Signal 在流式阶段短暂显示协议文本** → 延续 Action commit-on-close 的确定性取舍，避免把 inline code 或解释文本误闪为 Signal UI。
- **[Risk] `show.time` 后续删除产生契约调整** → 当前按真实 type 实现，不为假定的未来删除增加抽象；需要删除时单独更新 registry、prompt/spec 和 UI。
- **[Risk] system-reminder 体积增加** → Signal 只注入一个 type，formatter 保持简洁；不注入 renderer 或项目实现细节。

## Migration Plan

1. 抽取并验证 shared analyzer 与 prompt formatter，确保 Action 输出和 candidate/ordinal 测试不变。
2. 抽取 renderer Markstream transport，并让 Action wrapper 先切换到通用 helper。
3. 增加 Signal shared contract、renderer feature 和单协议测试。
4. 在 `MarkStream.vue` 组合 Action/Signal adapter，并接入 Chat 显式 enablement。
5. 在 Chat system-reminder provider 追加 Signal prompt contract，补充端到端契约测试。
6. 运行聚焦 main/renderer/shared tests、typecheck 和 lint；人工验证流式闭合、浅色/深色下的 `show.time`。

回滚时可移除 Signal contract、feature、Chat prop 和 provider 注入；generic helper 可以保留给 Action，也可以将 Action wrapper 内联回原实现。没有数据迁移或持久化清理。

## Open Questions

无。实现阶段不得为未闭合 Signal 增加 pending UI，也不得把 Shell 扩展成统一视觉组件。
