## 1. 数据层扩展

- [ ] 1.1 修改 `shared/types/project.ts`：`ProjectMeta` 新增 `healthScore?: number`，`ProjectInfo` 新增 `healthScore?: number`
- [ ] 1.2 修改 `electron/main/infra/storage/project-store.ts`：`toProjectInfo` 函数透传 `meta.healthScore` 到返回的 `ProjectInfo`；`createProjectMeta` 不主动写入 `healthScore`（保持可选）
- [ ] 1.3 修改 `electron/main/services/project/project-service.ts`：`updateProject` 的 `patch` 类型新增 `healthScore?: number`，合并逻辑中透传该字段到 `ProjectMeta`

## 2. AppHeader 健康度 icon

- [ ] 2.1 修改 `frontend/src/components/layout/AppHeader.vue`：在中央区域 ProjectSelector div 右侧（`UDropdownMenu` 外部）新增健康度 icon 按钮，使用 `UPopover` 包裹，仅在 `projectStore.currentProject` 非 null 时渲染
- [ ] 2.2 在 `AppHeader.vue` 中实现颜色映射 computed：`healthScore` 为 `undefined`/0 → `text-muted`，1–59 → `text-orange-500`，60–100 → `text-green-500`；icon 使用 `i-lucide-heart-pulse` 或 `i-lucide-activity`
- [ ] 2.3 在 `AppHeader.vue` 中实现 UPopover 内容：显示当前健康度状态说明文字（未检查 / 上次得分 N 分）+ "开始健康检查"按钮；按钮点击后关闭 Popover 并调用 `startHealthCheck()`

## 3. 健康检查 session 启动逻辑

- [ ] 3.1 在 `AppHeader.vue` 中实现 `startHealthCheck()` 函数：调用 `sessionStore.createSession({ projectId, agentId, title: "项目健康检查" })`，导航到 chat 页面
- [ ] 3.2 在 `startHealthCheck()` 中，session 创建成功后，调用 `chatApi.streamMessage` 发送 system-reminder 消息（内容见下方），该消息以 `<system-reminder>` 标签包裹，前端 `isSystemReminderPart` 工具函数会自动隐藏
- [ ] 3.3 system-reminder 内容（硬编码在 `AppHeader.vue` 或抽取到 `frontend/src/constants/health-check-reminder.ts`）：

  ```
  <system-reminder>
  你正在执行项目健康检查。请根据当前项目技术栈，检查以下三类约束的配置情况：

  评分公式（满分 100 分）：
  - 静态约束（eslint、prettier、tsconfig 等）：满分 40 分
  - 测试约束（test runner、coverage 配置等）：满分 30 分
  - 流程约束（git hooks、lint-staged、CI 等）：满分 30 分

  请创建一个 changeName 以 health-check- 开头的 proposal，在 tasks.md 中必须包含以下任务：
  通过 project:update IPC 将 healthScore（0-100 的整数）写入当前项目 meta.json。
  </system-reminder>
  ```

- [ ] 3.4 system-reminder 消息发送完成后，立即发送用户口吻消息："帮我根据当前项目技术栈检查：静态约束、测试约束、流程约束的配置情况并完善"

## 4. 验证

- [ ] 4.1 TypeScript 类型检查通过（`pnpm typecheck`）
- [ ] 4.2 AppHeader 在有/无活跃项目时健康度 icon 的显示/隐藏行为正确
- [ ] 4.3 颜色映射三档（灰/橙/绿）在不同 healthScore 值下渲染正确
