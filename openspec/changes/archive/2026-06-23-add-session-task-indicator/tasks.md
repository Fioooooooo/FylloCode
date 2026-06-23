## 1. Store 懒加载

- [x] 1.1 修改 `src/renderer/src/stores/session.ts`：暴露一个供组件调用的懒加载方法，例如 `ensureSessionOriginTaskInfo(session: Session): Promise<void>`，复用现有 `ensureOriginTaskInfo` 逻辑。
- [x] 1.2 确认 `ensureSessionOriginTaskInfo` 在 `session.originTaskRef` 为空或 `taskInfoBySessionId` 已存在时不调用 `lineageApi.getByTask`。
- [x] 1.3 确认 `ensureSessionOriginTaskInfo` 在 `lineage:getByTask` 返回 `null` 或抛错时写入 fallback `{ source, title: ref, ref }`，保持 popover 可展示。

## 2. Session Item Popover

- [x] 2.1 修改 `src/renderer/src/components/chat/SessionItem.vue`：保留 `session.originTaskRef` 非空时的常驻任务图标，图标继续使用统一任务语义图标 `i-lucide-clipboard-check`。
- [x] 2.2 将固定文案 tooltip 替换为 `UPopover`：用户 hover/open 任务图标时触发 `sessionStore.ensureSessionOriginTaskInfo(session)`，不得在组件中直接 import `lineageApi`、`taskApi` 或访问 `window.api`。
- [x] 2.3 在 `SessionItem.vue` 的 popover 内容中展示两项信息：来源 label（`local` -> `本地`、`yunxiao` -> `云效`、`github` -> `GitHub`）和任务标题（来自 `taskInfoBySessionId.get(session.id)?.title`）。
- [x] 2.4 在任务信息尚未加载时，popover 显示 `正在加载任务…`；加载失败或 subject 缺失时，标题降级为原始 `session.originTaskRef`。
- [x] 2.5 确认 `SessionItem.vue` 不在 session 列表初次渲染时批量请求 lineage，不扩展 `chat:listSessions` DTO，不新增 IPC。

## 3. Tests

- [x] 3.1 更新 `test/renderer/src/stores/session.spec.ts`：覆盖公开懒加载方法在无 `originTaskRef`、已缓存、有 ref 未缓存、`getByTask` 返回 null/失败时的行为。
- [x] 3.2 更新 `test/renderer/src/components/session-item.spec.ts`：覆盖 `originTaskRef` 非空时渲染 `data-test="session-origin-task-indicator"`，为空时不渲染。
- [x] 3.3 更新 `test/renderer/src/components/session-item.spec.ts`：覆盖 hover/open 任务图标会调用 session store 懒加载方法。
- [x] 3.4 更新 `test/renderer/src/components/session-item.spec.ts`：覆盖 popover 展示 source label 和 title，而不是固定 `已关联任务` 文案。

## 4. Verification

- [x] 4.1 运行 `pnpm vitest run test/renderer/src/components/session-item.spec.ts test/renderer/src/stores/session.spec.ts`。
- [x] 4.2 运行 `pnpm typecheck:web`。
- [x] 4.3 评估 guidelines 是否需要更新：本次只新增局部 UI 行为并复用现有 renderer/store/IPC 分层，不改变 UI 规范、renderer 分层、IPC、数据模型或测试约定，因此无需修改 `guidelines/*.md`。
