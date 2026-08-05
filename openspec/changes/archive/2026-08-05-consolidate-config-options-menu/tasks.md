## 1. ACP boolean capability 声明

- [x] 1.1 修改 `src/main/infra/process/acp-process-pool.ts`：为当前 SDK 0.25.x 缺失的 `clientCapabilities.session.configOptions.boolean` 定义窄局部 TypeScript 结构，构造 `{ session: { configOptions: { boolean: {} } } }` 并传入现有 `connection.initialize`；保持 `PROTOCOL_VERSION`、`clientInfo`、process pool 生命周期及 `package.json`/`pnpm-lock.yaml` 不变。完成标准：`pnpm typecheck:node` 接受该字段，且没有 SDK 升级、node_modules patch、`_meta` 伪装或 initialize payload 专项测试。

## 2. 单一 ConfigOptions 菜单

- [x] 2.1 重构 `src/renderer/src/components/chat/prompt/ConfigOptionsBar.vue` 的 option 投影：继续从 active session / ready draft probe 读取 snapshot并在组件内部过滤 `category=mode`，移除 `KNOWN_PRIORITY` 重排，保留 Agent 原始顺序；增加可复用的 flat/grouped value 展平与 current value name helper，value 不匹配时回退 raw `currentValue`。
- [x] 2.2 在 `ConfigOptionsBar.vue` 构造唯一 trigger 摘要：按 Agent 顺序取首个 select model 与首个 select thought level，双值使用 `·`、单值直接显示、都缺失显示 `Config`；摘要不设置最大宽度且不截断，tooltip/`aria-label` 保留完整文案，过滤后无 option 时不渲染 trigger。
- [x] 2.3 将 `ConfigOptionsBar.vue` 模板改为一个外层 `UDropdownMenu`：select option 作为含 `children` 的一级菜单项，flat/grouped value 保留原顺序、group label、description 与当前选中状态；boolean option 使用一级 `type: "checkbox"`、`checked` 和 `onUpdateChecked`；对应 pending option 单独 disabled/loading，change handler 继续复用 `sessionStore.setDraftConfigOption` 与 `chatStore.setConfigOption` 并由完整 snapshot 刷新全部 items。
- [x] 2.4 删除不再拥有独立 trigger 职责的 `src/renderer/src/components/chat/prompt/ConfigOptionItem.vue`，确认 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue` 仍只挂载 `ConfigOptionsBar` 且无需新增 props、events、mode 判断或菜单内部知识。
- [x] 2.5 为二级 value description 增加专用 DropdownMenu description slot：菜单内保留一行截断，悬停 description 时通过可换行 tooltip 展示全文；不得影响一级 config 当前值、boolean description 或 group label。

## 3. Renderer 回归测试

- [x] 3.1 重写 `test/renderer/src/components/config-options-bar.spec.ts` 的 Nuxt UI stubs 与断言，覆盖：任意数量 option 只产生一个 trigger；空/仅 mode 时隐藏；菜单按 Agent 原始顺序且 mode 被过滤；model + thought、单 category、无摘要 category、重复 category、raw value fallback 的 trigger 文案。
- [x] 3.2 在 `config-options-bar.spec.ts` 合并原 `ConfigOptionItem` 行为覆盖：flat/grouped select 子菜单、value description 与选中态、boolean 一级 checkbox、单 option pending、draft/session dispatch、draft → session handoff，以及完整 snapshot 改变 thought level/option 集合后菜单和摘要同步更新；删除 `test/renderer/src/components/config-option-item.spec.ts`。不得新增 initialize payload 专项测试。

## 4. 聚焦验证

- [x] 4.1 在 proposal worktree 首次运行项目命令前执行 `sh scripts/prepare-worktree-env.sh`，随后运行 `pnpm exec vitest run --project renderer test/renderer/src/components/config-options-bar.spec.ts`、`pnpm typecheck:node`、`pnpm typecheck:web`、`pnpm lint` 与 `git diff --check`；修复本变更引入的问题。不得运行 `pnpm build`，除非用户另行明确授权。
