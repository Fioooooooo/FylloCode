# Fyllo Signal

## 范围

- 在 Renderer 中把已闭合、独立成块的 `fyllo-signal` 渲染为轻量、非交互的内联展示。
- 每个 Signal type 自行定义视觉表达；共享 Shell 只提供宿主容器和必要 data attributes。
- 当前启用类型为 `show.time`。

## 非范围

- Signal 不注册、不持久化、不执行副作用，也没有 Action identity、状态机或 ordinal。
- Signal 不参与 EventRail、session attention 或 Action pending 聚合。
- Signal 的协议、schema、registry、解析和 prompt contract 位于 `src/shared/fyllo-signal/`。
- 通用 Markdown/Markstream tag transport 位于
  `src/renderer/src/components/shared/markstream/`。

## 公开入口

- `@renderer/features/fyllo-signal`：Signal UI 和 renderer registry。
- `@renderer/features/fyllo-signal/integration`：Markstream 宿主装配入口。

## Markstream 边界

- candidate/literal 判定复用 shared `analyzeFylloTagMarkdown()`。
- adapter 只把 candidate 改写为 render-only `fyllo-signal-render`，并复用通用
  placeholder 恢复；它不处理协议语义。
- 未闭合、代码区域或不满足 standalone 规则的 occurrence 保持普通 Markdown。
