## 1. 抽取共享 Markdown 与 Prompt 原语

- [x] 1.1 新建 `src/shared/fyllo-markdown/tag-analysis.ts`，把 `src/shared/fyllo-action/parser.ts` 的 fenced/inline code range、opening/closing tag、attribute、standalone blank-line、candidate/literal 和 source ordinal 逻辑迁入 `analyzeFylloTagMarkdown(source, { tagName })`；在 `src/shared/fyllo-action/protocol.ts` 通过显式 type alias 保留现有 `FylloActionMarkdown*` 类型，在 `src/shared/fyllo-action/parser.ts` 保留 `analyzeFylloActionMarkdown()` wrapper。验收：`test/shared/fyllo-action/parser.spec.ts` 的现有 candidate/literal、CRLF、未闭合和 ordinal 断言无需改变预期即可通过。
- [x] 1.2 新建 `test/shared/fyllo-markdown/tag-analysis.spec.ts`，用同一表驱动 case 对 `fyllo-action` 与 `fyllo-signal` 验证文件开头、最多三空格、四空格、prose 前后缀、list、blockquote、inline code、反引号/波浪号 fence、CRLF、多 occurrence 和未闭合规则完全一致；验收：两种 tag 的 disposition/context 序列相同且 raw source range 无损。
- [x] 1.3 新建 `src/shared/fyllo-markdown/prompt-contract.ts`，抽取 strict JSON、唯一 `type` 属性、`\u003c`/`\u003e`、standalone block、opening/closing 前后空行、literal 示例和 `JSON.stringify` example formatter；让 `src/shared/fyllo-action/prompt.ts` 调用该 helper。验收：`test/shared/fyllo-action/prompt.spec.ts` 增加重构前固定输出 fixture 或等价 byte-for-byte 断言，现有 Action prompt 内容与顺序不变。

## 2. 建立 Fyllo Signal Shared Contract

- [x] 2.1 创建 `src/shared/fyllo-signal/protocol.ts`、`schemas.ts` 和 `registry.ts`，定义 `FylloSignalType = "show.time"`、`ShowTimeSignalPayload`、`ready | invalid` semantic parse result、稳定错误 code、穷尽 contract registry 与 `enabledFylloSignalTypes`；`showTimeSignalPayloadSchema` 使用 strict object，并限制 `label` 为 1–200 个且不含 CR/LF 的字符。验收：新增 `test/shared/fyllo-signal/schemas.spec.ts` 和 `registry.spec.ts` 覆盖有效/多行/额外字段/registry 穷尽性。
- [x] 2.2 创建 `src/shared/fyllo-signal/parser.ts`，让 `analyzeFylloSignalMarkdown()` 调用 `analyzeFylloTagMarkdown(..., { tagName: "fyllo-signal" })`，并实现只允许 `type`、type 名称/registry lookup、JSON parse 和 Zod validation 的 `parseFylloSignalNode()`；不要增加 pending 状态。验收：`test/shared/fyllo-signal/parser.spec.ts` 覆盖 missing/invalid/unknown type、额外属性、invalid JSON/payload、ready payload，以及未闭合 occurrence 只出现在 structural literal analysis 中。
- [x] 2.3 创建 `src/shared/fyllo-signal/prompt.ts`，使用 shared formatter 生成 `<fyllo-signal-contract>`、被动展示/无需操作/不进入 EventRail 规则和 `show.time` example；新增 `test/shared/fyllo-signal/prompt.spec.ts` 验证 deterministic output、standalone/newline/literal/angle-bracket 规则、enabled type 覆盖、example JSON 与 schema 可解析，以及不包含 renderer 技术栈词汇。

## 3. 抽取并复用 Markstream Tag Transport

- [x] 3.1 新建 `src/renderer/src/components/shared/markstream/fyllo-tag.ts`，实现参数化的 `prepareFylloTagMarkdown()` 和 `createFylloTagNodeTransformer()`，config 仅包含 public tag、internal tag 和 placeholder namespace；迁移 candidate internal-tag 改写、collision-free placeholder、nested AST 遍历和原始 raw 恢复，不加入 semantic validation 或协议 registry。
- [x] 3.2 修改 `src/renderer/src/features/fyllo-action/integration/markstream.ts`，让 `prepareFylloActionMarkdown()` 与 `createFylloActionNodeTransformer()` 委托通用 transport，同时保留现有导出名、`registerPreparedFylloActions()` 和 `createFylloActionOrdinalResolver()`；更新 `test/renderer/src/features/fyllo-action/markstream-integration.spec.ts`，验收现有 internal tag、literal quote preservation、placeholder collision、重复 payload ordinal 和 registration 输入完全不变。
- [x] 3.3 在通用 transport 测试中覆盖不同 `placeholderNamespace` 和 internal tag 的组合，确保 Action/Signal transformer 均不遗留 placeholder，也不改写对方 internal node；测试文件放在 `test/renderer/src/components/shared/markstream/fyllo-tag.spec.ts`。

## 4. 实现轻量 Fyllo Signal Renderer Feature

- [x] 4.1 创建 `src/renderer/src/features/fyllo-signal/README.md`、`index.ts`、`integration/index.ts` 和 `integration/markstream.ts`；README 明确范围、非范围、根入口和 `/integration` 入口，Signal adapter 使用 `fyllo-signal-render`、Signal placeholder namespace 和通用 Markstream transport，不创建 model/application、ordinal、registration 或 EventRail 代码。
- [x] 4.2 创建 `ui/renderer-registry.ts`、`ui/FylloSignalNode.vue` 和 `ui/FylloSignalShell.vue`。registry 只保存 `type -> component`；Shell 只输出 host container、必要 data attributes 和 slot，不包含 presentation class、icon、title、click handler 或按钮；Node 对 ready result 渲染精确 type component，对 invalid result显示通用非交互诊断。验收：`test/renderer/src/features/fyllo-signal/ui/fyllo-signal-node.spec.ts` 验证 ready/invalid 分流、typed payload 和无 Action 副作用，`fyllo-signal-shell.spec.ts` 验证 Shell 不注入统一视觉/交互。
- [x] 4.3 创建 `ui/signals/ShowTimeSignal.vue`，由该 type component 自行定义时钟图标、紧凑 pill 的全部 Nuxt UI/Tailwind 语义样式和 label 展示；不添加点击、确认、取消或重试。验收：新增 `test/renderer/src/features/fyllo-signal/ui/signals/show-time-signal.spec.ts` 验证 icon、label 和非交互输出。

## 5. 接入 Chat、MarkStream 与 System Reminder

- [x] 5.1 修改 `src/renderer/src/components/shared/MarkStream.vue`，增加 `enableSignals?: boolean`，按 Action 后 Signal 的顺序准备 render-only content，合并 `fyllo-action-render`/`fyllo-signal-render` custom tags 与 component map，并将两个 node transformer 组合到单个 `postTransformNodes`；禁用时不得分析或注册对应协议。更新 `test/renderer/src/components/fyllo-action-markstream.spec.ts` 并新增 Signal/混合 case，验收 ready Action+Signal 同时渲染、literal 原文保留、Action ordinal/registration 不变、unclosed Signal 不出现 custom node。
- [x] 5.2 修改 `src/renderer/src/components/chat/message/ChatMessageList.vue` 和 `AssistantMessage.vue`，由 `props.type === "chat"` 显式传递 `enableSignals`，并只在 `isTextUIPart` 的 `MarkStream` 分支使用；Signal 开关不得依赖 `buildActionContext()`。更新 `test/renderer/src/components/fyllo-action-markstream.spec.ts` 或新增聚焦测试，验收 Chat assistant text 开启、缺少 Action context 仍开启、reasoning/tool/user 与 side/non-Chat message list 不开启。
- [x] 5.3 修改 `src/main/services/session/chat/system-reminder/providers/chat.ts`，在 `renderFylloActionPromptContract()` 后追加 `renderFylloSignalPromptContract()`，provider 不复制 Signal 文案。更新 `test/main/services/session/chat/system-reminder/resolve.spec.ts`、`guidelines.spec.ts` 和 `knowledge.spec.ts` 中受 section 顺序影响的断言，验收完整 reminder 同时包含两个 contract、Signal 位于 Action 后且其他 section 顺序保持稳定。
- [x] 5.4 增加 EventRail/session attention 回归断言，使用包含 ready `show.time` 的 session 验证 `collectPendingFylloActions()`、`useChatEventRail` 和 session attention 结果不新增 Signal item；复用 `test/renderer/src/features/fyllo-action/event-rail.spec.ts` 与 `session-attention.spec.ts` 的现有 fixture，不建立 Signal contributor。

## 6. 验证

- [x] 6.1 在首次运行项目命令前执行 `sh scripts/prepare-worktree-env.sh`；随后运行 Signal/Action shared、Markstream、renderer feature 和 system-reminder 聚焦 Vitest 用例，确认 commit-on-close、混合 transport、prompt 和 Chat enablement 均通过。
- [x] 6.2 运行 `pnpm test`、`pnpm typecheck` 和 `pnpm lint`，修复所有回归；不得通过 ESLint ignore、feature 白名单或降低 TypeScript strict 规则绕过问题。
- [x] 6.3 人工检查 Chat streaming 中未闭合 Signal 保持普通 Markdown、闭合后原位切换为 `show.time`，并检查浅色/深色主题下 pill、invalid fallback 和非 Chat MarkStream 宿主。
