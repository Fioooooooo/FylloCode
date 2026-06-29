## 1. Slideover 元数据刷新

- [x] 1.1 更新 `src/renderer/src/components/proposal/ProposalDetailSlideover.vue`，移除“store 非空则跳过”的 `ensureProposalLoaded()` 语义，在 `onMounted` 每次打开时无条件触发 `proposalStore.loadProposals()`，并保持 `loadMarkdownFiles()` 与 `loadSpecDeltas()` 仍按当前 `changeId` 读取。
- [x] 1.2 在 `ProposalDetailSlideover.vue` 增加 `refreshingMeta` 状态，刷新 `proposalStore.loadProposals()` 期间设为 `true`，完成或失败后设为 `false`，并把该状态传给 `ProposalDetailHeader.vue`。
- [x] 1.3 在 `ProposalDetailSlideover.vue` 增加当前请求序列号或等价 token，确保快速切换 `props.changeId`、archive 后切换到 archived id、或重复打开时，旧一轮异步请求不能覆盖最新一轮的 `refreshingMeta`、markdown tabs、Specs 数据和错误状态。
- [x] 1.4 在 `ProposalDetailSlideover.vue` 为 header 元数据增加 fallback：刷新开始前捕获当前 `ProposalMeta`；如果后台刷新失败导致 store 清空或未命中当前 `changeId`，`currentProposal` 仍回退展示刷新前已有数据。刷新成功且 store 命中后使用 store 数据。

## 2. Header 刷新状态 UI

- [x] 2.1 更新 `src/renderer/src/components/proposal/ProposalDetailHeader.vue` props，新增 `refreshingMeta: boolean`，并在任务数量所在的元数据行附近显示 `i-lucide-loader-2` loading icon。
- [x] 2.2 确保 `refreshingMeta === true` 时 loading icon 带旋转效果，`refreshingMeta === false` 时不渲染该 icon；该 icon 不改变现有关闭、开始实现、归档、查看运行历史按钮的交互。

## 3. 测试

- [x] 3.1 更新 `test/renderer/src/pages/proposal-detail.spec.ts` 的 proposal store mock，使 `loadProposals()` 能模拟后台刷新后替换 `proposalsValue`，验证打开 Slideover 时即使已有旧 store 数据也会调用 `loadProposals()`。
- [x] 3.2 在 `test/renderer/src/pages/proposal-detail.spec.ts` 增加用例：打开时 header 先展示旧任务数量，`loadProposals()` resolve 后自动展示刷新后的 `doneTasks/totalTasks`。
- [x] 3.3 在 `test/renderer/src/pages/proposal-detail.spec.ts` 增加用例：元数据刷新 pending 时 header 存在 loading icon，刷新结束后 icon 消失。
- [x] 3.4 在 `test/renderer/src/pages/proposal-detail.spec.ts` 增加用例：`loadProposals()` reject 或失败时 header 保留刷新前已有的 proposal 元数据，markdown 和 Specs 请求仍会发起。
- [x] 3.5 运行 `pnpm vitest run test/renderer/src/pages/proposal-detail.spec.ts`，并按需要运行 `pnpm lint` 验证 Vue/TypeScript 类型与模板绑定。

## 4. 文档与规范维护

- [x] 4.1 本变更复用现有 renderer store、proposal API 和 overlay 分层约束，不新增仓库 guideline 规则；实现时无需更新 `guidelines/*.md`。
