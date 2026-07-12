## 1. Shared Contract 与数据类型

- [x] 1.1 在 `src/shared/types/fyllo-action.ts` 中新增 `KnowledgeFlagActionPayload`、`KnowledgeReviewActionPayload`，并将 `FylloActionType` / `FylloActionPayloadByType` 扩展为 `knowledge.flag` 与 `knowledge.review`；`knowledge.review` payload 只包含 `name` 和可选 `summary`。
- [x] 1.2 在 `src/shared/schemas/knowledge.ts` 中定义 knowledge entry/name/path/hash schemas，并在 `src/shared/schemas/fyllo-action.ts` 中新增 `knowledgeFlagFylloActionPayloadSchema`、`knowledgeReviewFylloActionPayloadSchema`，校验 `summary`、`contextPaths`、kebab-case `name` 和 payload 上限；不再校验 review item 判别联合。
- [x] 1.3 在 `src/shared/constants/fyllo-action-contracts.ts` 中为 action contract 增加 `presentation: "inline" | "rail"` 与 `interaction: "passive" | "confirm"` 字段；保持 `task.create` 和 `plan.create` 的 payload schema 不变，并新增 prompt contract 文案说明 `knowledge.flag`、`knowledge.review` 和尖括号转义要求。
- [x] 1.4 新增 `src/shared/types/knowledge.ts`，定义 `KnowledgeEntryFrontmatter`、`KnowledgeEntryType`、`KnowledgeAnchor`、`KnowledgeComputedStatus`、`KnowledgeEntryDocument` 等跨 main/renderer/MCP 可复用类型。
- [x] 1.5 在 `test/shared` 增加 schema tests，覆盖合法/非法 `knowledge.flag`、合法/非法 `knowledge.review`、未知字段拒绝、非法 entry name、非法 action type 和旧 `task.create` / `plan.create` 回归。

## 2. Knowledge 存储、扫描与锚点状态

- [x] 2.1 在 `src/main/infra/storage/project-paths.ts` 新增 `knowledgeDir(projectPath: string)`，返回 `projectDir(projectPath)/knowledge`；在 tests 中断言该路径位于 app data project dir 下。
- [x] 2.2 新增可被 main 和 `fyllo-cortex` 复用的 knowledge scanner/serializer 模块，建议放在 `src/mcp-servers/fyllo-cortex/src/utils/knowledge/` 并由 main 侧 re-export，负责读取 `knowledge/*.md`、解析 frontmatter、剥离 body、稳定排序、报告 parse/read error。
- [x] 2.3 实现 entry markdown serializer：输入结构化 frontmatter/body，输出规范 YAML frontmatter + body；拒绝路径逃逸、重复 name、非法 frontmatter 和超过长度上限的 body。
- [x] 2.4 实现 anchor status 计算：`file` 使用 SHA-256 内容 digest，`package` 使用 `pnpm-lock.yaml` 中目标 package resolution entry 的稳定 SHA-256 `resolutionDigest`，`url` 使用 `verifiedAt` + `maxAgeDays ?? 90` freshness；无法验证返回 `unknown`，证据变化返回 `suspect`。
- [x] 2.5 在 `test/main/infra/storage` 或 `test/mcp-servers/fyllo-cortex` 增加 tests，覆盖缺失目录返回空 index、损坏 frontmatter 隔离、file/package/url anchor active/suspect/unknown、无锚点 source 条目 audit-exempt。

## 3. Fyllo Action 解析来源约束

- [x] 3.1 抽出或复用 Fyllo Action tag 解析与 action id 构建纯函数，并让 renderer 现有解析入口继续使用同一逻辑。
- [x] 3.2 保持 assistant message 持久化路径不变：`knowledge.flag` 不触发 main-side 投影，不写入 session meta。
- [x] 3.3 保持 `SessionMeta` / `Session` 不新增 `knowledgeFlags` 字段；pending knowledge flags 由 renderer 从当前 active session 已加载 messages 派生。
- [x] 3.4 增加 shared tests，覆盖 `knowledge.flag` tag 解析和确定性 chat action id。

## 4. System Reminder Knowledge 注入

- [x] 4.1 新增 `src/main/services/session/chat/system-reminder/providers/knowledge.ts`，扫描 app data knowledge index，渲染 `<knowledge>` 块，按 `project`、`reference`、`feedback` 分组输出 `name — description [status]` 紧凑行。
- [x] 4.2 在 `src/main/services/session/chat/system-reminder/providers/chat.ts` 中按顺序拼接 chat template、guidelines section、knowledge section、Fyllo Action contract；Apply/Archive provider 在 v1 不接入 capture/review 流程。
- [x] 4.3 在 `<knowledge>` 文案中加入读取规则、`suspect/unknown` 验证规则、knowledge 非 live instruction 规则、flag test、常见触发线索和禁止自发 capture 规则。
- [x] 4.4 对注入字段统一复用 `escapeAngleBrackets` 或等价函数，确保 description/body-derived text 无法关闭 `<knowledge>`、`<system-reminder>` 或 `<fyllo-action>`。
- [x] 4.5 增加 `test/main/services/session/chat/system-reminder/knowledge.spec.ts`，覆盖空目录省略或安全降级、active/suspect/unknown 标记、转义、防止 archive 注入、knowledge 位于 action contract 前。

## 5. fyllo-cortex Knowledge Tool

- [x] 5.1 在 `src/mcp-servers/fyllo-cortex/src/tools/knowledge.ts` 新增 `knowledge` tool，schema 包含 `mode: capture|update|retire|audit`、`name`、`reason`、`includeInstruction`，并用 refine 强制 update/retire 的必填字段。
- [x] 5.2 新增并校正 `src/mcp-servers/fyllo-cortex/src/tools/instructions/knowledge/modes/{capture,update,retire,audit}.md` 与 `shared/{frontmatter-contract,admission-tests}.md`，内容覆盖准入测试、entry contract、agent 写入 app data markdown、输出 `knowledge.review` 的 `name` payload 和 guardrails。
- [x] 5.3 扩展 `src/mcp-servers/fyllo-cortex/src/utils/load-prompt.ts`，加载 knowledge mode prompts；扩展 `src/mcp-servers/fyllo-cortex/src/tools/index.ts` 注册 `registerKnowledgeTool(server)`。
- [x] 5.4 Tool state 使用 `FYLLO_PROJECT_DATA_DIR/knowledge` 构建 index；`capture` 返回 index 和 `knowledgeRoot`，`update/retire` 返回 target 当前内容/hash/status，`audit` 返回完整 status 和 approximate rendered index token count。
- [x] 5.5 更新 `test/mcp-servers/fyllo-cortex/tools.test.ts`，覆盖 tool list 包含 `knowledge`、capture/update/retire/audit state、includeInstruction false、schema 必填校验、缺失 knowledge 目录、target missing、parse error 和 instruction 要求 agent 写入 markdown 后输出 `knowledge.review` name payload。

## 6. Renderer Fyllo Action 与 EventRail

- [x] 6.1 更新 `src/renderer/src/config/fyllo-actions.ts`，为 definitions 增加 `presentation`、`interaction`，新增 `KnowledgeFlagAction` 和按 `name` 展示的 `KnowledgeReviewAction` renderer components，并保持旧 action definitions 行为不变。
- [x] 6.2 更新 `src/renderer/src/components/shared/markstream/FylloActionShell.vue` 和 `FylloActionNode.vue`：`knowledge.flag` 作为普通 confirm action 展示确认/取消按钮；确认时触发 capture，取消只记录 action state；`presentation=rail` actions 继续提供可定位 anchor。
- [x] 6.3 更新 `src/renderer/src/utils/fyllo-action-rail.ts`，让 EventRail 在现有 renderer 扫描 assistant text parts 的基础上收集未处理 `knowledge.flag` actions；保持 `task.create` / `plan.create` pending 操作仍可显示。
- [x] 6.4 更新 `src/renderer/src/components/chat/event/ChatFylloActionPanel.vue` 或新增 knowledge 专用 rail panel，展示 flag summary 和数量；EventRail 不提供 capture 操作按钮，点击条目只定位 inline action。
- [x] 6.5 在 `knowledge.flag` handler 中新增 capture trigger 编排：从当前已加载 session 派生全部 pending flags，检查 chat store `chatStatus`，并调用 chat store `sendMessage` 发送两个 text parts；chat store 只保留通用发送能力，不承载 knowledge 文案编排。
- [x] 6.6 增加 renderer tests，覆盖 flag confirm 有按钮、review confirm 有按钮、review payload 使用 `name`、EventRail 展示 renderer 解析出的 knowledge flags 且不暴露 capture 按钮、ActionShell capture 一次发送全部 pending flags 并将同批 flags 标记完成、capture 消息拆成隐藏 `<system-reminder>` 和用户可见 text part、streaming 时不能发送 capture、旧 task/proposal rail 行为不回退。

## 7. Knowledge Review Slideover 与 Raw Markdown IPC

- [x] 7.1 新增 `src/shared/ipc/insight/knowledge.channels.ts` 与 `knowledge.schemas.ts`，定义 `insight:knowledge:readEntry` 和 `insight:knowledge:saveEntry`，输入包含 `projectId`、`name`，保存额外包含完整 `content`。
- [x] 7.2 新增 `src/main/services/insight/knowledge/knowledge-document-service.ts`，按 `knowledgeDir(projectPath)/<name>.md` 读取和原子保存 markdown 原文；只校验 name/path 安全，不解析或重组 frontmatter。
- [x] 7.3 新增 `src/main/ipc/insight/knowledge.ts` 并接入 `src/main/ipc/insight/index.ts`；新增 `src/preload/api/insight/knowledge.ts`、`src/renderer/src/api/insight/knowledge.ts` 和 preload `index.d.ts` 类型暴露，knowledge 与 lineage 在 `insight` domain 下平级。
- [x] 7.4 新增 `KnowledgeReviewSlideover` 与 `useKnowledgeReviewSlideover`，复用 plan review 交互：打开时 readEntry，编辑器展示完整 md 原文，编辑实时 saveEntry，确认前 flush 保存并返回 approved。
- [x] 7.5 在 `src/renderer/src/composables/useFylloActionDispatcher.ts` 中新增 `knowledge.flag` 与 `knowledge.review` handlers；`knowledge.flag` handler 负责编排 capture message 并调用 chat store `sendMessage`，`knowledge.review` 像 `plan.create` 一样打开 slideover 并把 approved/dismissed 转换为 `FylloActionHandlerResult`。
- [x] 7.6 增加 main/preload/renderer tests，覆盖 read/save raw markdown、路径逃逸拒绝、slideover 加载完整 frontmatter 原文、实时保存、确认只完成 action state、不执行 capture/update/retire 持久化 handler。

## 8. Guidelines 与文档同步

- [x] 8.1 更新 `guidelines/MainProcess.md`，记录 knowledge 持久化归属：app data `knowledge/` storage 属 main infra/storage，review raw markdown read/save IPC 属 `insight:knowledge`；`knowledge.flag` 不写 session meta。
- [x] 8.2 更新 `guidelines/RendererProcess.md`，记录 renderer 侧 knowledge capture 入口归属：EventRail 只展示和定位 pending flags，`knowledge.flag` handler 编排 capture message 并通过 chat store 发送，renderer 组件不得直接写 knowledge 文件。
- [x] 8.3 更新 `src/mcp-servers/fyllo-cortex/CHANGELOG.md` 或对应 MCP server README，说明新增 `knowledge` tool modes 和 `FYLLO_PROJECT_DATA_DIR/knowledge` 读取约定。

## 9. 验证

- [x] 9.1 运行 `sh scripts/prepare-worktree-env.sh`，确认 main worktree Node/pnpm 环境可用。
- [x] 9.2 运行聚焦测试：`pnpm exec vitest run --project main test/main/services/session/chat/system-reminder/knowledge.spec.ts test/main/infra/storage/session-store.spec.ts test/main/ipc/insight/knowledge.spec.ts test/main/services/insight/knowledge/knowledge-document-service.spec.ts`。
- [x] 9.3 运行 MCP 测试：`pnpm exec vitest run --project main test/mcp-servers/fyllo-cortex/tools.test.ts`。
- [x] 9.4 运行 renderer 聚焦测试：`pnpm exec vitest run --project renderer test/renderer/src/components/fyllo-action-node.spec.ts test/renderer/src/components/chat-session-event-rail.spec.ts test/renderer/src/utils/fyllo-action-rail.spec.ts`。
- [x] 9.5 运行质量门禁：`pnpm typecheck`、`pnpm lint`、`pnpm test`。
