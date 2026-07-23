# Fyllo Signal 设计文档

状态：draft
日期：2026-07-23

---

## 1. 概述与定位

### 1.1 定义

Fyllo Signal 是 agent 在文本输出中嵌入的**被动展示标记**。它不需要用户做任何操作，只在对话流中提供一个可视化的信息片段或可交互的信息入口。

### 1.2 与 Fyllo Action 的职责分离

| 维度      | Fyllo Action                      | Fyllo Signal                |
| --------- | --------------------------------- | --------------------------- |
| 交互性    | 有操作按钮（确认/取消）           | 无操作按钮                  |
| 状态管理  | 状态机 + revision 乐观锁 + 持久化 | 无状态机、无持久化          |
| 呈现形态  | 卡片式（Shell 包裹）              | 行内元素（轻量 Shell 边框） |
| Rail 集成 | 参与 EventRail 强提醒             | 不参与 EventRail            |
| 标记格式  | `<fyllo-action type="...">`       | `<fyllo-signal type="...">` |
| 语义      | 用户交互事件                      | 被动信息展示                |

### 1.3 核心特性

- **静态标记**：嵌入时是快照，signal 本身不负责状态更新
- **行内渲染**：轻量行内元素，Shell 定义基础形态，各 type 组件定义内部 UI 细节
- **可点击**（按 type 可选）：部分 type 支持点击展开详情（如 slideover），由 type 对应的组件自定义事件
- **不参与 Rail**：不在对话侧边 EventRail 中强提醒
- **无状态机**：没有 ready/succeeded/cancelled，没有 revision 乐观锁，没有操作按钮

---

## 2. 标记格式

### 2.1 语法规范

```
<fyllo-signal type="<type>">{ JSON payload }</fyllo-signal>
```

- 唯一允许的属性是 `type`
- body 必须是严格 JSON 对象，符合对应 type 的 payload schema
- 不允许 Markdown 代码围栏、注释、trailing comma、数组、字符串或裸文本
- 当 payload 中的文本需要字面尖括号时，必须在 JSON 字符串中编码为 `<` 和 `>`

### 2.2 Markdown 定位规则

与 fyllo-action 相同的 candidate/literal 判定规则：

- **Candidate**：已闭合、位于 Markdown 正文（非代码区域）、前后各有空行的 standalone block → 渲染为 signal UI
- **Literal**：位于行内代码或围栏代码块中、或不满足 standalone 条件 → 保持原始文本输出
- 未闭合的 occurrence 始终作为 literal Markdown

### 2.3 Type 命名规则

与 fyllo-action 一致，使用 `domain.verb` 格式：小写 kebab 段由点分隔，至少两段。

```
show.time          ✓
spawn.session      ✓
showtime           ✗ （单段）
Show.Time          ✗ （大写）
```

---

## 3. Type 注册表设计

### 3.1 FylloSignalContract

对比 fyllo-action 的 `FylloActionContract`，signal 的 contract 更轻量——无 `interaction`、无 `presentation`（统一为 inline）。

```ts
interface FylloSignalPayloadFieldContract {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface FylloSignalPromptContract<Type extends FylloSignalType> {
  purpose: string;
  payloadFields: readonly FylloSignalPayloadFieldContract[];
  constraints: readonly string[];
  example: Readonly<FylloSignalPayloadByType[Type]>;
}

interface FylloSignalContract<Type extends FylloSignalType> {
  type: Type;
  payloadSchema: z.ZodType<FylloSignalPayloadByType[Type]>;
  prompt: FylloSignalPromptContract<Type>;
}
```

相比 `FylloActionContract`，移除了：

- `presentation`（signal 统一行内展示）
- `interaction`（signal 无交互状态）

### 3.2 注册表结构

```ts
const contracts = {
  "show.time": { ... },
} as const satisfies Record<FylloSignalType, FylloSignalContract<FylloSignalType>>;

export const fylloSignalContracts = contracts;

export function getFylloSignalContract(
  type: string
): FylloSignalContract<FylloSignalType> | undefined;

// 复用 fyllo-action 的 type 命名校验函数
export function isValidFylloSignalTypeName(value: string): boolean;

export const enabledFylloSignalTypes: FylloSignalType[];
```

---

## 4. 共享层设计（`src/shared/fyllo-signal/`）

### 4.1 文件清单与职责

```
src/shared/fyllo-signal/
├── protocol.ts     # 类型定义（FylloSignalType、payload、parse result）
├── schemas.ts      # Zod payload schema
├── registry.ts     # Signal contract registry（type → payloadSchema/prompt）
├── parser.ts       # Markdown 标签扫描、attr 解析、payload 校验
└── prompt.ts       # 生成注入 system-reminder 的 prompt contract 字符串
```

不需要的文件（相比 fyllo-action）：

- ~~`identity.ts`~~：signal 无持久化状态，不需要构造跨进程 ID
- ~~`state.ts`~~：signal 无状态机

### 4.2 各文件详细设计

#### `protocol.ts`

```ts
export type FylloSignalType = "show.time";

export interface ShowTimeSignalPayload {
  label: string;
}

export interface FylloSignalPayloadByType {
  "show.time": ShowTimeSignalPayload;
}

export type FylloSignalPayload<T extends FylloSignalType = FylloSignalType> =
  FylloSignalPayloadByType[T];

export type FylloSignalParseErrorCode =
  | "missing_type"
  | "invalid_type_name"
  | "unknown_type"
  | "unexpected_attribute"
  | "invalid_json"
  | "invalid_payload";

export interface FylloSignalParseError {
  code: FylloSignalParseErrorCode;
  message: string;
  details?: string[];
}

export interface FylloSignalPendingParseResult {
  status: "pending";
  type?: string;
}

export interface FylloSignalInvalidParseResult {
  status: "invalid";
  type?: string;
  error: FylloSignalParseError;
}

export type FylloSignalReadyParseResult = {
  [Type in FylloSignalType]: {
    status: "ready";
    type: Type;
    payload: FylloSignalPayloadByType[Type];
  };
}[FylloSignalType];

export type FylloSignalParseResult =
  FylloSignalPendingParseResult | FylloSignalInvalidParseResult | FylloSignalReadyParseResult;

// Markdown analysis 类型（与 fyllo-action 对称，但无持久化相关字段）

export type FylloSignalMarkdownDisposition = "candidate" | "literal";

export type FylloSignalMarkdownContext = "markdown" | "inline_code" | "fenced_code";

export interface FylloSignalMarkdownOccurrence {
  start: number;
  end: number;
  openingTagEnd: number;
  closingTagStart: number | null;
  raw: string;
  attrs: Record<string, string>;
  body: string;
  closed: boolean;
  sourceOrdinal: number;
  disposition: FylloSignalMarkdownDisposition;
  context: FylloSignalMarkdownContext;
}

export interface FylloSignalMarkdownAnalysis {
  sourceLength: number;
  occurrences: FylloSignalMarkdownOccurrence[];
}

export interface FylloSignalMarkdownNode {
  type?: string;
  attrs?: Record<string, unknown> | [string, unknown][] | null;
  loading?: boolean;
  raw?: string;
  content?: string;
}
```

#### `schemas.ts`

```ts
import { z } from "zod";

export const fylloSignalTypeSchema = z.enum(["show.time"]);

export const showTimeSignalPayloadSchema = z.strictObject({
  label: z.string().min(1).max(200),
});
```

#### `registry.ts`

结构同第 3 节描述的 contract 注册表。

#### `parser.ts`

**与 fyllo-action 解析逻辑的关系**：

fyllo-action 的 `parser.ts` 中有两类逻辑：

1. **通用 HTML 标签扫描逻辑**：代码区域检测（fenced/inline code ranges）、opening tag 定位、attr 解析、blank line 检测、candidate/literal 判定
2. **fyllo-action 特定逻辑**：硬编码的 `<fyllo-action` / `</fyllo-action>` 标签名和 contract lookup

**设计决策**：fyllo-signal 的 parser 自包含实现，将通用扫描逻辑复制并修改标签名为 `<fyllo-signal` / `</fyllo-signal>`。

理由：

- 共享提取虽然减少重复，但引入了耦合——两个 parser 的扫描策略可能独立演进（例如 signal 未来可能支持 inline 嵌入不要求 blank line）
- fyllo-action parser 经过充分测试和实战验证，复制其结构可以确保 signal parser 的正确性
- 如果未来出现第三个带内标记通道，再考虑提取通用扫描库

parser 暴露的核心 API：

```ts
export function analyzeFylloSignalMarkdown(source: string): FylloSignalMarkdownAnalysis;

export function parseFylloSignalNode(node: FylloSignalMarkdownNode): FylloSignalParseResult;
```

#### `prompt.ts`

生成注入 system-reminder 的 prompt contract 字符串，格式与 fyllo-action 的 prompt.ts 对称。

```ts
export interface FylloSignalPromptSection {
  id: "fyllo-signal-contract";
  content: string;
}

export function renderFylloSignalPromptContract(): string;

export function buildFylloSignalPromptSection(): FylloSignalPromptSection;
```

输出格式（示例）：

```xml
<fyllo-signal-contract>
Rules:
- Only emit enabled signal types.
- The only allowed attribute is type.
- The body must be a strict JSON object matching the enabled type schema.
- Do not use Markdown code fences, comments, trailing commas, arrays, strings, or bare text inside the tag.
- When payload text needs literal angle brackets, encode them as < and > inside JSON strings.
- Emit a real signal only as a standalone top-level Markdown block starting at the beginning of a line; indenting it four or more spaces turns it into a code block.
- If prose precedes the signal, insert a blank line (two newline characters) before the opening tag; never append the opening tag to a prose line.
- After the closing tag, either end the response or insert a blank line before continuing; never append further text to the closing-tag line.
- When explaining the public tag syntax or showing a non-executable example, wrap it in inline code or a fenced code block.

Enabled signal types: show.time.

- show.time
  Purpose: Display the current date and time inline when the user asks about it.
  Required fields: label
  Optional fields: none
  Constraints:
    - label must be a single non-empty line describing the current date and time.
    - Emit only once per response; do not repeat for the same time query.
  Executable output example (emit without Markdown fences and keep the surrounding blank lines):

<fyllo-signal type="show.time">
{
  "label": "2026-07-23 14:30"
}
</fyllo-signal>

</fyllo-signal-contract>
```

---

## 5. Renderer Feature 层设计（`src/renderer/src/features/fyllo-signal/`）

### 5.1 目录结构

对标 fyllo-action 的四层结构，精简掉不需要的部分：

```
src/renderer/src/features/fyllo-signal/
├── index.ts                      # Feature 公开入口
├── ui/
│   ├── FylloSignalNode.vue       # Markstream 渲染入口（对标 FylloActionNode）
│   ├── FylloSignalShell.vue      # 基础行内 Shell（对标 FylloActionShell，但更轻量）
│   ├── renderer-registry.ts      # 前端 signal 定义注册表
│   └── signals/
│       └── ShowTimeSignal.vue    # show.time 的内部 UI 组件
└── integration/
    ├── index.ts                  # Integration 入口
    └── markstream.ts             # Markstream adapter
```

不需要的层（相比 fyllo-action）：

- ~~`model/`~~：signal 无持久化状态、无 pending projection、无 selector、无 attention 计数
- ~~`application/`~~：signal 无注册 controller、无执行 controller、无 handler、无 dispatcher

### 5.2 各层职责

#### `ui/renderer-registry.ts`

```ts
import type { Component } from "vue";
import type { FylloSignalPayloadByType, FylloSignalType } from "@shared/fyllo-signal/protocol";

export interface RendererSignalDefinition<Type extends FylloSignalType = FylloSignalType> {
  type: Type;
  title: string;
  icon: string;
  component: Component<{ payload: FylloSignalPayloadByType[Type] }>;
  clickable?: boolean;
}

export const rendererSignalDefinitions: Record<FylloSignalType, RendererSignalDefinition>;

export function getRendererSignalDefinition(type: string): RendererSignalDefinition | undefined;
```

#### `ui/FylloSignalShell.vue`

行内 Shell 组件，不像 FylloActionShell 那样有状态、按钮、badge，而是一个轻量的行内元素：

```vue
<template>
  <!-- ready 状态：行内展示 -->
  <span
    class="inline-flex items-center gap-1.5 rounded-md border border-default
           bg-elevated px-2 py-0.5 text-xs text-default align-baseline"
    :class="definition?.clickable ? 'cursor-pointer hover:bg-accented' : ''"
    @click="definition?.clickable ? emit('click') : undefined"
  >
    <UIcon v-if="definition?.icon" :name="definition.icon" class="size-3.5 shrink-0" />
    <slot />
  </span>

  <!-- pending 状态：骨架 -->
  <!-- invalid 状态：fallback 文本 -->
</template>
```

关键区别：

- 使用 `<span>` 而非 `<section>`，行内级别
- 无状态 badge、无确认/取消按钮、无错误重试
- 可选的 `clickable` 样式和 click 事件

#### `ui/FylloSignalNode.vue`

Markstream 渲染入口，对标 FylloActionNode 但大幅简化：

```vue
<script setup lang="ts">
import { computed } from "vue";
import { parseFylloSignalNode } from "@shared/fyllo-signal/parser";
import type { FylloSignalMarkdownNode } from "@shared/fyllo-signal/protocol";
import { getRendererSignalDefinition, rendererSignalDefinitions } from "./renderer-registry";
import FylloSignalShell from "./FylloSignalShell.vue";

const props = defineProps<{
  node: FylloSignalMarkdownNode;
  isDark?: boolean;
}>();

const parseResult = computed(() => parseFylloSignalNode(props.node));

const definition = computed(() => {
  if (parseResult.value.status !== "ready") return null;
  return getRendererSignalDefinition(parseResult.value.type) ?? null;
});

const signalComponent = computed(() => definition.value?.component ?? null);
</script>

<template>
  <FylloSignalShell :parse-result="parseResult" :definition="definition">
    <component
      :is="signalComponent"
      v-if="signalComponent && parseResult.status === 'ready'"
      :payload="parseResult.payload"
    />
  </FylloSignalShell>
</template>
```

无需：

- 注入 host context（无状态管理）
- action ordinal 解析（无持久化 ID）
- 执行 runtime（无 handler）
- confirm/cancel/retry 事件（无交互操作）

#### `integration/markstream.ts`

Markstream adapter，与 fyllo-action 的 adapter 对称但更简单：

```ts
import FylloSignalNode from "../ui/FylloSignalNode.vue";
import { analyzeFylloSignalMarkdown } from "@shared/fyllo-signal/parser";
import type {
  FylloSignalMarkdownAnalysis,
  FylloSignalMarkdownOccurrence,
} from "@shared/fyllo-signal/protocol";

export { FylloSignalNode };

const PUBLIC_FYLLO_SIGNAL_OPEN = "<fyllo-signal";
const PUBLIC_FYLLO_SIGNAL_CLOSE = "</fyllo-signal>";
const INTERNAL_FYLLO_SIGNAL_TAG = "fyllo-signal-render";

export const fylloSignalMarkstreamCustomHtmlTags = [INTERNAL_FYLLO_SIGNAL_TAG] as const;

export interface PreparedFylloSignalMarkdown {
  content: string;
  analysis: FylloSignalMarkdownAnalysis;
  candidates: FylloSignalMarkdownOccurrence[];
  placeholders: FylloSignalLiteralPlaceholder[];
}

// prepareFylloSignalMarkdown：同 fyllo-action 的逻辑，
// 将 candidate occurrence 改写为 internal tag，literal occurrence 用 placeholder 穿透
export function prepareFylloSignalMarkdown(
  source: string,
  analysis?: FylloSignalMarkdownAnalysis
): PreparedFylloSignalMarkdown;

// createFylloSignalNodeTransformer：postTransformNodes hook，
// 还原 literal placeholder 为原始文本
export function createFylloSignalNodeTransformer(
  prepared: Pick<PreparedFylloSignalMarkdown, "placeholders">
): PostTransformNodes;
```

不需要的部分（相比 fyllo-action adapter）：

- ~~`registerPreparedFylloActions`~~：signal 无注册流程
- ~~`createFylloActionOrdinalResolver`~~：signal 无持久化 ID 映射
- ~~`FylloActionHostContextInput`~~：signal 无 host context

#### `index.ts`

```ts
// UI
export { default as FylloSignalNode } from "./ui/FylloSignalNode.vue";
export { default as FylloSignalShell } from "./ui/FylloSignalShell.vue";
export { rendererSignalDefinitions, getRendererSignalDefinition } from "./ui/renderer-registry";
export type { RendererSignalDefinition } from "./ui/renderer-registry";
```

### 5.3 Markstream 集成方案

在 `MarkStream.vue` 中，需要同时支持 fyllo-action 和 fyllo-signal 两种标记。整合方式：

1. **Custom HTML Tags 合并**：将两种标记的 internal tag 合并传入 markstream-vue

```ts
const customHtmlTags = computed(() => {
  const tags: string[] = [];
  if (props.enableActions) tags.push(...fylloActionMarkstreamCustomHtmlTags);
  if (props.enableSignals) tags.push(...fylloSignalMarkstreamCustomHtmlTags);
  return tags.length > 0 ? tags : undefined;
});
```

2. **Markdown 预处理串联**：先处理 action，再处理 signal（两者标签名不同，互不干扰）

```ts
const preparedContent = computed(() => {
  let content = props.content;
  let actionPrepared = null;
  let signalPrepared = null;

  if (props.enableActions) {
    actionPrepared = prepareFylloActionMarkdown(content);
    content = actionPrepared.content;
  }
  if (props.enableSignals) {
    signalPrepared = prepareFylloSignalMarkdown(content);
    content = signalPrepared.content;
  }

  return { content, actionPrepared, signalPrepared };
});
```

3. **PostTransformNodes 合并**：两个 transformer 链式组合

4. **Custom Components 注册**：在 `setCustomComponents` 中同时注册两种组件

```ts
setCustomComponents(props.id, {
  [fylloActionMarkstreamCustomHtmlTags[0]]: FeatureFylloActionNode,
  [fylloSignalMarkstreamCustomHtmlTags[0]]: FeatureFylloSignalNode,
});
```

### 5.4 行内 UI 渲染方案

Signal 在对话流中呈现为行内元素，与周围文本自然流动：

```
Agent 文本输出...

<FylloSignalShell>   ← 行内 span，不打断段落流
  <UIcon />          ← 可选图标
  <ShowTimeSignal /> ← type 组件渲染的内容
</FylloSignalShell>

Agent 后续文本...
```

Shell 的 CSS 要点：

- `display: inline-flex`，`align-items: center`
- 圆角边框 `rounded-md border border-default`
- 轻量背景 `bg-elevated`
- 适当内边距 `px-2 py-0.5`
- 文字大小与周围文本协调 `text-xs`

---

## 6. Prompt Contract 设计

### 6.1 注入位置

在 system-reminder 中注入 `<fyllo-signal-contract>` 块，与 `<fyllo-action-contract>` 并列。

### 6.2 规则

Prompt contract 的规则与 fyllo-action 对称，但语义调整为"展示"而非"交互"：

```xml
<fyllo-signal-contract>
Rules:
- Only emit enabled signal types.
- The only allowed attribute is type.
- The body must be a strict JSON object matching the enabled type schema.
- Do not use Markdown code fences, comments, trailing commas, arrays, strings, or bare text inside the tag.
- When payload text needs literal angle brackets, encode them as < and > inside JSON strings.
- Emit a real signal only as a standalone top-level Markdown block starting at the beginning of a line; indenting it four or more spaces turns it into a code block.
- If prose precedes the signal, insert a blank line (two newline characters) before the opening tag; never append the opening tag to a prose line.
- After the closing tag, either end the response or insert a blank line before continuing; never append further text to the closing-tag line.
- When explaining the public tag syntax or showing a non-executable example, wrap it in inline code or a fenced code block.
- Signals are passive display markers — they require no user action and do not appear in the session event rail.

Enabled signal types: show.time.

[per-type contracts...]
</fyllo-signal-contract>
```

### 6.3 栈无关约束

prompt contract 中的所有文案（purpose、constraints、example）不得引用项目特定名词（如 FylloCode、Electron、Vue 等）。使用通用描述。

---

## 7. 第一个 Type：`show.time`

### 7.1 用途

`show.time` 是一个**流程连通性测试 type**。当用户询问当前时间时，agent 以 fyllo-signal 标记输出，验证从 prompt contract → agent 输出 → Markdown 解析 → UI 渲染的完整链路。

未来引入真实 type 后，此 type 将被移除。

### 7.2 Payload 结构

```ts
interface ShowTimeSignalPayload {
  label: string; // 简短的时间描述，如 "2026-07-23 14:30"
}
```

Zod schema：

```ts
export const showTimeSignalPayloadSchema = z.strictObject({
  label: z.string().min(1).max(200),
});
```

### 7.3 Prompt Contract

```
- show.time
  Purpose: Display the current date and time inline when the user asks about it.
  Required fields: label
  Optional fields: none
  Constraints:
    - label must be a single non-empty line describing the current date and time.
    - Emit only once per response; do not repeat for the same time query.
  Executable output example (emit without Markdown fences and keep the surrounding blank lines):

<fyllo-signal type="show.time">
{
  "label": "2026-07-23 14:30"
}
</fyllo-signal>
```

### 7.4 Renderer 定义

```ts
{
  type: "show.time",
  title: "当前时间",
  icon: "i-lucide-clock",
  component: ShowTimeSignal,
  clickable: false,
}
```

### 7.5 行内渲染样式

`ShowTimeSignal.vue` 组件极简，只展示 `label` 文本：

```vue
<script setup lang="ts">
import type { ShowTimeSignalPayload } from "@shared/fyllo-signal/protocol";

defineProps<{ payload: ShowTimeSignalPayload }>();
</script>

<template>
  <span class="text-highlighted">{{ payload.label }}</span>
</template>
```

最终渲染效果（在对话流中）：

```
[🕐 2026-07-23 14:30]
```

一个带浅色边框和时钟图标的行内 pill，不可点击，不可操作。

### 7.6 Agent 使用场景

当用户询问：

- "现在几点？"
- "当前时间是什么？"
- "What time is it?"

Agent 应输出（注意前后空行）：

```
当前时间如下：

<fyllo-signal type="show.time">
{
  "label": "2026-07-23 14:30"
}
</fyllo-signal>
```

---

## 8. 实现文件清单

### 共享层

| 文件路径                              | 职责                     |
| ------------------------------------- | ------------------------ |
| `src/shared/fyllo-signal/protocol.ts` | 类型定义                 |
| `src/shared/fyllo-signal/schemas.ts`  | Zod payload schema       |
| `src/shared/fyllo-signal/registry.ts` | Contract 注册表          |
| `src/shared/fyllo-signal/parser.ts`   | Markdown 扫描 + 语义解析 |
| `src/shared/fyllo-signal/prompt.ts`   | Prompt contract 生成     |

### Renderer Feature 层

| 文件路径                                                               | 职责                   |
| ---------------------------------------------------------------------- | ---------------------- |
| `src/renderer/src/features/fyllo-signal/index.ts`                      | Feature 公开入口       |
| `src/renderer/src/features/fyllo-signal/ui/FylloSignalNode.vue`        | Markstream 渲染入口    |
| `src/renderer/src/features/fyllo-signal/ui/FylloSignalShell.vue`       | 行内 Shell 组件        |
| `src/renderer/src/features/fyllo-signal/ui/renderer-registry.ts`       | 前端 signal 定义注册表 |
| `src/renderer/src/features/fyllo-signal/ui/signals/ShowTimeSignal.vue` | show.time 内部组件     |
| `src/renderer/src/features/fyllo-signal/integration/index.ts`          | Integration 入口       |
| `src/renderer/src/features/fyllo-signal/integration/markstream.ts`     | Markstream adapter     |

### 需修改的现有文件

| 文件路径                                            | 修改内容                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `src/renderer/src/components/shared/MarkStream.vue` | 集成 signal 的 custom tags、prepare、transformer、component 注册 |
| prompt injection 入口文件                           | 新增 `fyllo-signal-contract` section                             |
