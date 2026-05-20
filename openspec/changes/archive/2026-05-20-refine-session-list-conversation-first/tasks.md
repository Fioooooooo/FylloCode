## 1. 收敛 session 条目结构

- [x] 1.1 修改 `frontend/src/components/chat/SessionItem.vue`：重排模板结构，使正文改为“标题第一行 + 时间戳/轮次数第二行”的两层内容；保留 `session.title`、`formatTime(session.updatedAt)`、`session.turnCount`、`session.status` 和 `agentIcon` 的现有数据来源，不改 store 或 IPC。
- [x] 1.2 在同一组件中移除当前独立状态点列，把运行状态并入前导媒体区；实现完成后条目左侧只保留一个前导视觉锚点，且 `running` 状态仍可被感知。
- [x] 1.3 在同一组件中保留稳定的前导占位逻辑：`agentIcon` 可解析时显示图片；不可解析时仍渲染固定尺寸的前导容器或 fallback，不得让标题起始位置发生跳变。

## 2. 调整列表容器与选中态编排

- [x] 2.1 修改 `frontend/src/components/chat/ChatSidebar.vue`：把 session 列表容器从强依赖 `border-b` 的行式列表调整为带轻间距的导航列表；保留搜索框、新建按钮、空态和 `v-for` 数据流不变。
- [x] 2.2 视需要修改 `frontend/src/pages/chat.vue`：仅在 `w-65` 侧栏宽度下标题仍明显受压时，做最小幅度的侧栏宽度或内边距调整；若现有宽度足够，则不要扩 scope 到整体页面布局。
- [x] 2.3 验收：在 `pnpm dev` 下打开 chat 页面，包含长标题、有/无 icon、`running`/`ended` 的 session 列表都能稳定显示，标题是第一视觉焦点，三点菜单仍保持悬停出现。

## 3. 更新组件测试

- [x] 3.1 修改 `frontend/src/__tests__/components/session-item.spec.ts`：保留现有“切换 session 会 reset 瞬时 chat 状态”的行为测试，不改其业务语义断言。
- [x] 3.2 在同一测试文件中更新展示断言，覆盖：
  - 可解析 icon 时仍渲染 `data-test=\"session-agent-icon\"`
  - 无 icon 时仍渲染稳定的前导媒体容器
  - 长标题仍可渲染并保持截断语义
  - 运行状态的可感知提示位于前导媒体区而非独立状态点列
- [x] 3.3 如果 `SessionItem.vue` 的测试钩子不足以稳定表达新结构，则只新增最小必要的 `data-test` 标记；不要为样式细节增加脆弱的 class 全量匹配断言。

## 4. 回归验证

- [x] 4.1 运行 `pnpm test -- session-item` 或项目内对应 Vitest 命令，确认 `session-item.spec.ts` 通过。
- [x] 4.2 运行 `pnpm lint` 和 `pnpm typecheck`，确认 session 列表改动没有引入 renderer 层 lint/type 回归。
- [x] 4.3 手动验证 chat 页：选中态、悬停菜单、缺失 icon、长标题截断、新建 session 按钮和空态展示均与当前功能一致，只改变视觉层级与布局表现。
