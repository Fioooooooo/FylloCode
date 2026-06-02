## 1. 共享契约

- [x] 1.1 在 `shared/types/settings.ts` 新增 `ReleaseCheckStatus`、`ReleaseCheckResult`、`ReleaseCheckSuccess` 类型，字段至少包含 `status`、`currentVersion`、`latestVersion`、`releaseUrl`、`releaseName`、`publishedAt`。
- [x] 1.2 在 `shared/types/channels.ts` 的 `SettingsChannels` 中新增 `checkLatestRelease: "settings:checkLatestRelease"`，避免新增 IPC 业务域。
- [x] 1.3 在 `shared/schemas/ipc/settings.ts` 新增空入参 schema，例如 `checkLatestReleaseInputSchema = z.object({}).strict()`。
- [x] 1.4 在 `shared/constants/error-codes.ts` 新增 `RELEASE_CHECK_FAILED` 与 `RELEASE_VERSION_INVALID`，并确保 `IpcErrorCode` 联合类型自动包含它们。

## 2. 主进程检测服务

- [x] 2.1 新增 `electron/main/services/release/release-version-service.ts`，导出 `checkLatestRelease()`、`compareReleaseVersions()` 和必要的内部解析函数。
- [x] 2.2 `checkLatestRelease()` 使用 `app.getVersion()` 获取当前版本，并使用 `fetch("https://api.github.com/repos/Fioooooooo/FylloCode/releases/latest")` 获取最新正式 Release；解析 `tag_name`、`html_url`、`name`、`published_at`。
- [x] 2.3 `compareReleaseVersions(currentVersion, latestTag)` 去掉前导 `v` 后只接受 `major.minor.patch` 数字段；远端版本大于当前版本时返回 `update-available`，否则返回 `up-to-date`。
- [x] 2.4 检测请求失败、非 2xx 响应、缺失必要字段或版本不可解析时，service 抛出可由 IPC 层映射到 `RELEASE_CHECK_FAILED` 或 `RELEASE_VERSION_INVALID` 的错误。

## 3. IPC 与 Bridge

- [x] 3.1 在 `electron/main/ipc/settings.ts` 注册 `SettingsChannels.checkLatestRelease` handler，使用 `validate(checkLatestReleaseInputSchema, input)` 校验入参，调用 `checkLatestRelease()`，通过 `wrapHandler` 返回 `IpcResponse<ReleaseCheckResult>`。
- [x] 3.2 在 `electron/preload/api/settings.ts` 增加 `checkLatestRelease(): Promise<IpcResponse<ReleaseCheckResult>>`。
- [x] 3.3 在 `electron/preload/index.d.ts` 保持 `settingsApi` 类型推导可见，无需手写重复接口。
- [x] 3.4 在 `frontend/src/api/settings.ts` 增加同名薄封装，renderer 只能通过 `window.api.settings.checkLatestRelease()` 消费。

## 4. About UI 与 Store

- [x] 4.1 在 `frontend/src/stores/settings.ts` 新增 `releaseCheckResult`、`releaseCheckLoading`、`releaseCheckError` 状态和 `checkLatestRelease()` action；失败时保留 About 基础信息。
- [x] 4.2 在 `frontend/src/components/settings/SettingsAbout.vue` 的 `UCard` 中新增新版本检测区域，展示未检测、检测中、已是最新、有新版本、检测失败五种状态。
- [x] 4.3 有新版本时展示最新版本号、发布时间和 GitHub Release 打开入口；入口使用 `releaseUrl`，文案不得出现“自动安装”“重启安装”或等价承诺。
- [x] 4.4 检测失败时展示错误文案和重试按钮；重试按钮再次调用 store 的 `checkLatestRelease()`。

## 5. 测试

- [x] 5.1 新增 `electron/main/__tests__/services/release/release-version-service.spec.ts`，覆盖版本比较、前导 `v` 处理、当前已最新、远端更低、无效版本、GitHub 响应解析失败。
- [x] 5.2 更新或新增 `electron/main/__tests__/ipc/settings.spec.ts`，覆盖 `settings:checkLatestRelease` 成功返回和错误码归一化。
- [x] 5.3 更新 `frontend/src/__tests__/stores/settings.spec.ts`，覆盖 release 检测状态、失败后错误展示状态和 About 基础信息不被清空。
- [x] 5.4 更新 `frontend/src/__tests__/components/settings-about.spec.ts`，覆盖检测入口、加载态、有新版本、已是最新、检测失败与重试。

## 6. 文档与验证

- [x] 6.1 更新 `guidelines/Build.md` 或新增相关段落，说明本变更只实现 GitHub Release 版本检测与引导下载，不属于 electron-updater 自动更新，不要求签名，也不改变 release workflow。
- [x] 6.2 运行 `pnpm typecheck`、`pnpm lint`、`pnpm vitest run electron/main/__tests__/services/release/release-version-service.spec.ts electron/main/__tests__/ipc/settings.spec.ts frontend/src/__tests__/stores/settings.spec.ts frontend/src/__tests__/components/settings-about.spec.ts`。备注：`pnpm typecheck` / `pnpm run typecheck:web` 仍因既有 `frontend/src/composables/useConfirmDialog.ts(13,19)` 缺失 `useOverlay` 类型失败；`pnpm run typecheck:node`、`pnpm lint` 与定向 Vitest 均通过。
