# Chat Event Rail

状态：未来重组方向，仅作边界留存；应在 Fyllo Action feature 边界稳定后迁移。

## 目标

让 Chat Event Rail 成为不同提醒来源的宿主聚合器，只消费各 feature 的公开 contributor/projection，不读取 Fyllo Action、proposal 或 agenda 的内部 DTO。

## 当前来源

- `src/renderer/src/components/chat/event/**`
- `src/renderer/src/composables/useChatEventRail.ts`
- 当前 Fyllo Action rail collector 与 proposal slideover 依赖

## 预期边界

- `model`：通用 rail section/order/visibility 纯投影，不包含来源 feature 的业务判定。
- `application`：当前 session 的 contributor 聚合和定位意图编排。
- `ui`：ChatSessionEventRail、EventRailContent 及通用 section shell。
- `integration`：注册 Fyllo Action、proposal、agent agenda contributor，并连接消息滚动宿主。
- 每个来源 feature 自己决定哪些事件可见，并向 Rail 暴露稳定 projection。

## 保持在 feature 外

- Fyllo Action pending 判定与 Action identity
- proposal display status 与详情加载
- session/proposal stores

迁移顺序必须晚于 Fyllo Action 的 `model/pending-actions.ts` 和 `integration/event-rail.ts` 落地，避免继续复制旧 DTO 耦合。
