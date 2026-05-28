## 1. 共享 schema 与类型扩展

- [x] 1.1 在 `shared/schemas/ipc/chat.ts` 的 `createSessionInputSchema`（当前在 50-54 行）扩展两个可选字段：
  - `configOptions: z.array(<复用 acp config option schema>).optional()` —— 复用 `shared/types/acp-config.ts` / 现有 `setConfigOption` 校验中已使用的 schema 引用；若没有现成可复用的 zod schema，则使用 `z.array(z.unknown()).optional()` 并在主进程侧二次走 `normalizeAcpSessionConfigOptions` 归一化。
  - `acpSessionId: z.string().min(1).optional()`
  - 验收：`pnpm typecheck` 通过；`createSessionInputSchema.parse({ projectId, title, agentId })` 与 `parse({ ..., configOptions: [...], acpSessionId: "x" })` 都返回成功。
- [x] 1.2 在 `electron/preload/api/chat.ts` 的 `createSession` 入参类型（32-38 行）扩展为：
  ```ts
  createSession(input: {
    projectId: string;
    title: string;
    agentId?: string;
    configOptions?: AcpSessionConfigOption[];
    acpSessionId?: string;
  }): Promise<IpcResponse<Session>>;
  ```

  - 同步 import `AcpSessionConfigOption` 自 `@shared/types/acp-config`。
  - 验收：preload `pnpm typecheck` 通过；从 renderer 传入新字段不报类型错误。

## 2. 主进程 createSession 写入 probe 数据

- [x] 2.1 修改 `electron/main/services/chat/chat-service.ts` 的 `createSession`（52-70 行）：
  - 入参类型扩展：`{ projectId; title; agentId; configOptions?: AcpSessionConfigOption[]; acpSessionId?: string }`。
  - 在构造 `meta: SessionMeta` 时，对 `configOptions` 与 `acpSessionId` 做存在性判断：
    - `configOptions !== undefined` 时，先经 `normalizeAcpSessionConfigOptions` 归一化再写入 `meta.config_options`。
    - `acpSessionId` 为非空字符串时写入 `meta.acpSessionId`。
  - 不改变 `tokenUsage`、`turnCount`、`createdAt`、`updatedAt`、`title`、`agentId` 的初始化逻辑。
  - 验收：单元测试覆盖「带 configOptions / acpSessionId 写入 meta」「不传时 meta 不含这两个字段」。
- [x] 2.2 修改 `electron/main/ipc/chat.ts` 的 `ChatChannels.createSession` handler（94-106 行附近，含 `validate(createSessionInputSchema, input)` 与 `createSession(form)` 调用）：
  - 把 `form` 中可选的 `configOptions` 与 `acpSessionId` 透传给 service 层 `createSession`。
  - 不新增 `try/catch` 分支；遵循现有 `ipcResult` / `ipcError` 风格。
  - 验收：existing handler 测试（如有）保持绿；新增 case：入参带新字段时 service 调用参数包含这两个字段。

## 3. 渲染端 store 透传与时序调整

- [x] 3.1 修改 `frontend/src/stores/session.ts` 的 `createSession` action（318-337 行）：
  - 入参类型扩展为 `{ projectId; agentId; title?; configOptions?: AcpSessionConfigOption[]; acpSessionId?: string }`。
  - 把新字段透传给 `chatApi.createSession`。
  - 不修改 `normalizeSession`（已经在 64-72 行处理完整 `Session` 字段，包含 `configOptions`）。
  - 验收：`frontend/src/__tests__/stores/session.spec.ts` 新增测试 —— `createSession` 透传 `configOptions` / `acpSessionId` 给 `chatApi.createSession`，并把响应中的 `configOptions` 写入 `sessions.value`。
- [x] 3.2 修改 `frontend/src/stores/chat.ts` 的草稿态首条消息流程（240-283 行）：
  - 在调用 `sessionStore.createSession({ ... })` 时附带：
    ```ts
    const probeBeforeCreate = sessionStore.draftProbeByAgent.get(draftAgentIdSnapshot);
    const carryProbe =
      probeBeforeCreate?.status === "ready" && probeBeforeCreate.acpSessionId
        ? {
            configOptions: probeBeforeCreate.configOptions,
            acpSessionId: probeBeforeCreate.acpSessionId,
          }
        : {};
    const createdSession = await sessionStore.createSession({
      projectId: projectIdSnapshot,
      agentId: draftAgentIdSnapshot,
      title: fallbackTitleSnapshot,
      ...carryProbe,
    });
    ```
  - 把 `sessionStore.applyProbeUpdate(draftAgentIdSnapshot, null)` 移到 `createSession` 的 `await` 之后、`activeSession` 已经切到新 session 之后再执行，仍仅在 `probeBeforeCreate?.status === "ready"` 时调用。
  - `streamOptions = { acpSessionId: probeBeforeCreate.acpSessionId }` 行为保持不变。
  - `createSession` 抛错路径下不调 `applyProbeUpdate(null)`（保持 draft probe 复用）。
  - 验收：`frontend/src/__tests__/stores/chat.spec.ts` 新增测试覆盖「首条消息后 `activeSession.configOptions` 与 draft probe 一致」「`createSession` 失败时 `draftProbeByAgent` 仍包含原 entry」。

## 4. ConfigOptionsBar 过渡帧消失验证

- [x] 4.1 在 `frontend/src/__tests__/components/config-options-bar.spec.ts` 新增测试：
  - 模拟「ready 的 draft probe → `streamMessage` 触发 `createSession` 成功 → activeSession 已带 configOptions → applyProbeUpdate(null)」时序，断言组件 `sortedOptions.length` 在整个时序中始终 ≥ draft probe 的 `configOptions.length`，且不出现 `0` 中间值。
  - 实现可通过手动驱动 store action + `await flushPromises()` + `nextTick` 检查。
  - 验收：测试通过；移除/还原本次代码改动后测试失败（保证有效性）。

## 5. 主进程 stream takeFor 兜底兼容

- [x] 5.1 验证 `electron/main/ipc/chat.ts` 的 stream `takeFor` 路径（228-247 行）在 `createSession` 已写入 `config_options` 与 `acpSessionId` 的情况下行为正确：
  - 不需要修改实现；只要确认 `patchSessionMeta` 用相同 value 写入是幂等（`mergeSessionMetaRecord` 行为已经覆盖这点）。
  - 在已有的 stream handler 测试（如 `electron/main/__tests__/...` 或集成测试）中新增 case：「先 createSession with probe 字段 → 再 streamMessage with same acpSessionId」断言 meta 文件最终内容 `config_options` 与 `acpSessionId` 一致，`updatedAt` 较第一次写入更晚。
  - 若主进程侧暂无对应测试基础设施，则在 PR 描述中说明手动验证步骤。

## 6. 类型与端到端检查

- [x] 6.1 运行 `pnpm typecheck` 确保 main / web 两侧类型一致。
- [x] 6.2 运行 `pnpm test` 确保 vitest 全部通过（含新增测试）。
- [x] 6.3 运行 `pnpm lint` 修复 lint 错误。
- [x] 6.4 启动 `pnpm dev` 手动验证：
  - 草稿态选定一个 agent，等待 ConfigOptionsBar 渲染。
  - 发送第一条消息，观察 footer 的 ConfigOptionsBar 在切换瞬间不闪空、消息发送完毕后保持显示。
  - 切到另一个会话再切回来，确认 ConfigOptionsBar 仍在显示。
  - 关闭 FylloCode 重新打开，选中该会话，确认 ConfigOptionsBar 仍按 meta.json 中的 `config_options` 渲染。

## 7. 仓库 guideline 评估

- [x] 7.1 评估是否需要更新 `guidelines/` 下的相关文档：
  - `guidelines/RendererProcess.md`：是否需要在「session store 与 draft probe 生命周期」段落补一条「draft → session 交接时 configOptions 必须随 createSession 透传」？
  - `guidelines/IPC.md`：是否需要在 `chat:createSession` 入参描述里追加 `configOptions` / `acpSessionId` 两个可选字段及语义？
  - 如需更新，把具体文件路径与拟新增段落写入对应 PR 描述；如不需要，在 PR 描述里写明评估结果与原因。
