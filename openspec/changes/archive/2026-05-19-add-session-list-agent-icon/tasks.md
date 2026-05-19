## 1. Session 列表条目展示

- [x] 1.1 更新 `frontend/src/components/chat/SessionItem.vue`，接入 `useAcpAgentsStore` 并基于 `session.agentId` 解析 agent icon，给条目增加固定尺寸的前导 icon 区域，同时保留现有状态点、标题、时间和 turn 数展示与点击/菜单交互。
- [x] 1.2 调整 `frontend/src/components/chat/SessionItem.vue` 的模板与样式类，确保 icon 命中时显示图片，未命中时保留空占位，且不会破坏标题截断、右侧菜单 hover 显示和选中态背景。

## 2. 验证与测试

- [x] 2.1 扩展 `frontend/src/__tests__/components/session-item.spec.ts`，覆盖至少三类场景：切换 session 仍会 reset 瞬时 chat 状态、存在 icon 时渲染对应 agent 图像、缺失 icon 时仍保留稳定前导区域且不影响文本信息渲染。
- [x] 2.2 运行与本变更直接相关的 renderer 测试，至少包括 `pnpm vitest run frontend/src/__tests__/components/session-item.spec.ts`；若测试 stub 需要支持新增的图像/头像节点，在 `frontend/src/__tests__/setup.ts` 中补齐最小必要 stub，并记录验证结果。
