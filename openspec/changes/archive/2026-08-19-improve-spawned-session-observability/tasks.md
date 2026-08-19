## 1. Main 进程存储与查询模型

- [x] 1.1 在 `src/main/infra/storage/spawned-session-store.ts` 的 `SpawnedSessionMeta` 中增加可选的首轮与当前 prompt 摘要字段，并在 `SpawnedSessionManager.promptToAgent` 的新建和续聊路径写入有界摘要；保持旧版 version 1 元数据可读，并补充 store 与 manager 测试。
- [x] 1.2 将当前父 Session 聚合读取拆分为轻量 `listSpawnedSessionSummariesForParent` 与单 Session `loadSpawnedSessionStoredView`：列表只能读取 meta 与最新 turn，detail 才读取目标 Session 的完整 messages；通过测试证明列表路径不会加载 message 文件。
- [x] 1.3 在 `src/shared/ipc/session/spawned-session.schemas.ts` 中引入包含 prompt 与结构化 messages 的 `SpawnedSessionTurnDetail`，同步 IPC、preload 与 renderer API 类型及 schema 测试，不改变现有 owner-scoped 权限边界。
- [x] 1.4 重构 `SpawnedSessionQueryService`，让 list 返回轻量摘要、detail 只查询一个目标 Session，并按 turn 时间窗口与持久化顺序把 messages 归属到各 turn；仅将 live handle 快照合并到匹配的最新 turn，覆盖多 turn、遗留摘要缺失、局部文件缺失和续聊重新 active 的测试。

## 2. Renderer 查询生命周期与 wake 收敛

- [x] 2.1 重构 `src/renderer/src/stores/session/spawned-session.ts`，分别维护 list/detail 的 interest 引用计数，并为飞行中请求增加 dirty/queued refresh；保留 generation 防串线与缓存，确保 terminal wake 不丢失、关闭的 detail 不重查、多个入口共享 interest、Workspace 切换不泄漏旧数据。
- [x] 2.2 更新 `use-spawned-session-inspector.ts` 与 `SpawnedSessionInlineEntry.vue`：常驻入口只消费 list summary，打开/关闭 Slideover 时显式注册/注销 detail interest；补充重复打开、关闭后 wake、Signal 深链点击等测试。
- [x] 2.3 保持 bootstrap view-wake listener 的无 payload、level-triggered 语义，更新相关测试以验证一次 wake 会刷新有 interest 的列表和已打开详情，但不会触碰 completion notification 状态。

## 3. Chat 底部活动栏与逐 Turn Slideover

- [x] 3.1 新增 `ChatBackgroundActivityBar.vue`，并将 spawned-session 入口从 `ChatPromptPanel.vue` 移到 `ChatContainer.vue` 的输入框外部 footer 区域；通过 feature 公共入口组合组件，展示当前非 draft 父 Session 的全部 spawned Sessions、总数与 active 数量，并按 active 优先排序。
- [x] 3.2 将现有 active-background 专用入口重构为只读 `SpawnedSessionActivityEntry`，统一显示 sync/background、active/terminal 状态；更新 feature `index.ts`、README 和 Chat/入口组件测试，且不提前引入通用 activity contributor registry。
- [x] 3.3 为 `SpawnedSessionDetailSlideover.vue` 增加 turn 选择：默认跟随最新 turn，用户选中历史 turn 后保持选择并提示新活动；每个 turn 继续使用现有投影器展示聚合 Activity 与压缩 Transcript，不改造成完整聊天复刻，并覆盖 loading、empty、partial、error、键盘焦点及窄窗口测试。
- [x] 3.4 抽取或更新 spawned-session projection/selectors，集中处理 active 判定、排序、计数和逐 turn 投影，避免组件重复推导状态；为多 Session、多 turn 和 tool-call 聚合补充单元测试。

## 4. Prompt 与 Signal 兼容契约

- [x] 4.1 更新 `src/shared/fyllo-signal/registry.ts` 的 `spawn.session` prompt 元数据，将它描述为可选上下文深链而非发现 spawned Session 的必要信号；同步 `test/shared/fyllo-signal/registry.spec.ts` 与 `prompt.spec.ts`。
- [x] 4.2 更新 `src/mcp-servers/fyllo-spawn/src/tools/prompt-to-agent.ts` 的工具说明，明确 Main 会自动暴露新建和续聊 Session、Signal 仅为可选深链，并保留异步优先与同步模式限制；同步 fyllo-spawn tools/server 测试，不改变 MCP 工具名称或参数 schema。

## 5. 指南与验证

- [x] 5.1 更新 `guidelines/MainProcess.md`，记录轻量父级列表、单 Session detail、Main 侧逐 turn 归组和 level-triggered view wake 的所有权约束。
- [x] 5.2 更新 `guidelines/RendererProcess.md` 与 `guidelines/RendererFeatures.md`，记录 Chat footer 活动宿主、feature 公共入口、interest 引用计数与 queued refresh 约束；若 UI 约定需要同步，再更新 `guidelines/UiDesign.md`。
- [x] 5.3 在首次运行项目命令前执行 `sh scripts/prepare-worktree-env.sh`，随后运行 spawned-session storage/service/manager/IPC、shared schema/Signal、preload、fyllo-spawn 和 renderer feature/Chat 组件的聚焦 Vitest 测试。
- [x] 5.4 运行 `pnpm typecheck:node`、`pnpm typecheck:web` 与 `pnpm lint`；不以 `pnpm build` 作为自动验证步骤，除非另行取得明确授权。
- [x] 5.5 手工验证亮色/暗色与窄窗口下的多 Session、sync/background、续聊重新 active、terminal 历史、逐 turn 切换、Signal 可选深链、键盘焦点，并确认 EventRail 与 completion notification 行为未变化。
