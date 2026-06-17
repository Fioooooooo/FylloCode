## 1. Session meta 存储层改造

- [x] 1.1 在 `src/main/infra/storage/session-store.ts` 中新增 `updateSessionOriginTaskRef(projectPath, sessionId, originTaskRef)` 函数，内部通过 `withSessionMetaWriteLock` 直接读写 meta，仅更新 `originTaskRef` 和 `updatedAt`，保留其他字段。
- [x] 1.2 确认 `SessionMetaPatch` 类型继续 omit `originTaskRef`，保持通用 patch 接口无法修改该字段。
- [x] 1.3 为 `updateSessionOriginTaskRef` 添加单元测试：验证更新成功、保留其他字段、session 不存在时返回 null。
- [x] 1.4 更新 `test/main/infra/storage/session-store.spec.ts` 中关于 `originTaskRef` write-once 的旧断言，改为受控写入语义。

## 2. Lineage 服务写入 originTaskRef

- [x] 2.1 在 `src/main/services/lineage/lineage-service.ts` 的 `createSessionTask` 函数中，任务创建成功并 backfill 到 lineage subject 后，调用 `updateSessionOriginTaskRef` 把新任务的 `LineageTaskRef`（`local:${task.id}`）写回对应 session meta。
- [x] 2.2 确保 `createSessionTask` 在 `updateSessionOriginTaskRef` 失败时抛出错误，使 action card 进入 failed 状态；任务本身已创建但绑定失败，用户可重试。
- [x] 2.3 为 `createSessionTask` 添加测试：验证成功后 session meta 的 `originTaskRef` 被更新；验证更新失败时 IPC 返回错误。

## 3. Renderer 层回显绑定任务

- [x] 3.1 在 `src/renderer/src/stores/session.ts` 中新增或复用机制，使 `activeSession.originTaskRef` 更新后 `taskInfoBySessionId` 中对应 sessionId 的缓存失效，触发 `OriginTaskBanner` 重新懒加载任务信息。
- [x] 3.2 在 `src/renderer/src/composables/useFylloActionDispatcher.ts` 的 `task.create` 分支中，成功后调用 session store 的刷新/缓存失效逻辑，确保 banner 立即回显。
- [x] 3.3 更新 `src/renderer/src/components/chat/OriginTaskBanner.vue` 的展示逻辑（如需要）：确保当 `originTaskRef` 从 undefined 变为有值时能正确渲染；视觉样式保持不变。
- [x] 3.4 添加/更新 renderer 测试：`task.create` fyllo-action 成功后，`activeSession.originTaskRef` 和 banner 展示正确更新。

## 4. 受控写入约束验证

- [x] 4.1 全局搜索 `originTaskRef` 的写入位置，确认除 `chat-service.createSession` 和 `lineage-service.createSessionTask` 外没有其他写入者。
- [x] 4.2 确认 `chat-service.createSession` 初始化 `originTaskRef` 的逻辑无需改动，但需保证其仍通过 `createSessionMeta` 落盘。
- [x] 4.3 确认 `SessionMetaPatch` 在编译期仍禁止传入 `originTaskRef`。

## 5. 回归与集成测试

- [x] 5.1 运行 `pnpm typecheck`，确保 `SessionMetaPatch` 约束和新增函数类型正确。
- [x] 5.2 运行 `pnpm test`，修复因 `originTaskRef` 语义变化导致的失败用例。
- [x] 5.3 在本地开发环境手动验证：从草稿会话发起对话，让 Agent 输出 `task.create` fyllo-action，确认后 banner 展示新任务；多次创建时 banner 始终展示最新任务。
