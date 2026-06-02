## Context

FylloCode 当前使用 electron-builder 发布桌面产物，`electron-builder.yml` 的 `publish.provider` 已配置为 GitHub，release workflow 会将各平台安装包上传到 GitHub draft release。项目依赖中已有 `electron-updater`，但用户当前没有 macOS/Windows 签名证书；macOS 自动更新对签名依赖强，Windows 未签名自动安装体验也不可控。

本次变更只做“新版本检测与引导下载”。它不改变打包产物生成方式，不改变 release workflow，不依赖 `latest.yml`，也不接入 `electron-updater`。

## Goals / Non-Goals

**Goals:**

- 在 About tab 中展示新版本检测入口，并给出明确状态。
- 从 GitHub 最新正式 Release 读取版本与链接信息。
- 使用主进程执行网络请求，renderer 只通过 Settings IPC 消费结果。
- 将版本比较、GitHub 响应解析和 UI 状态纳入测试。

**Non-Goals:**

- 不下载安装包到本地。
- 不调用 `autoUpdater.checkForUpdates()`、`checkForUpdatesAndNotify()` 或 `quitAndInstall()`。
- 不实现后台自动安装、重启安装或差分更新。
- 不要求本次配置 macOS notarization、Apple Developer ID、Windows 代码签名证书。
- 不在应用启动时自动发起 GitHub 请求；本次检测入口限定在 About tab，避免无用户意图的启动网络请求。

## Decisions

### Decision: 使用 Settings 域暴露 Release 检测

新增 `SettingsChannels.checkLatestRelease`，由 `electron/main/ipc/settings.ts` 调用 release 检测 service。About 页当前已经通过 `settings:getAppInfo` 读取应用版本，继续使用 Settings 域可以避免新增业务域，也符合 About 面板的信息来源。

替代方案是新增 `app:checkLatestRelease`。当前 `ipc-protocol` 规范的业务域列表未将 `app` 列为核心域，继续扩展 Settings 域更少触碰 IPC 域边界。

### Decision: 主进程直接请求 GitHub latest release API

新增 `electron/main/services/release/release-version-service.ts`，使用 Node/Electron 运行时可用的 `fetch` 请求 `https://api.github.com/repos/Fioooooooo/FylloCode/releases/latest`。主进程负责解析 `tag_name`、`html_url`、`name`、`published_at`，并与 `app.getVersion()` 比较。

替代方案是 renderer 直接请求 GitHub。该方案会把网络失败、响应解析和版本比较散落到 UI 层，也不符合当前 IPC 分层习惯。

### Decision: 只识别正式 Release，忽略 draft/prerelease

GitHub latest release API 用于用户可见的正式 Release。检测结果不读取 draft release，也不把 prerelease 当作稳定更新。当前 workflow 生成 draft release 的流程保持不变；维护者必须在准备对用户可见时发布 release，用户端才会检测到。

### Decision: 版本比较只处理 SemVer 数字段

新增纯函数 `compareReleaseVersions(currentVersion, latestTag)`，先去掉前导 `v`，再解析 `major.minor.patch` 数字段。若任一版本无法解析，返回检测失败而不是猜测大小关系。

替代方案是引入 semver 依赖。项目当前没有直接依赖 semver；本次只需要比较 `package.json.version` 与 GitHub tag 的稳定 SemVer，手写纯函数更轻量，也更容易单测。

### Decision: About UI 不提供“自动安装”文案

当发现新版本时，About 面板只展示版本、发布时间和“打开 Release 页面”动作。文案不得暗示应用会自动下载、自动安装或重启后自动替换。

## Risks / Trade-offs

- GitHub API 请求失败或限流 → UI 显示检测失败和重试入口，不影响 About 基础信息展示。
- draft release 不会被用户检测到 → 这是刻意选择；draft 用于发布前检查，正式 publish 后才对用户可见。
- 未签名安装包仍会触发系统安全提示 → 本方案不绕过平台安全机制，只把安装动作交给用户。
- 简化 SemVer 比较不支持复杂 prerelease/build metadata → 本次只使用正式 release tag；复杂版本策略需要后续单独提案。

## Migration Plan

无需数据迁移。发布后，已安装应用在用户进入 About tab 并触发检测时即可看到最新正式 Release 状态。若后续要升级到真正自动更新，需要新增独立 OpenSpec change，重新评估签名、发布源、安装时机和 `electron-updater` 接入。
