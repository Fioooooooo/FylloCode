## Why

当前项目已经通过 GitHub Release 发布桌面安装包，但在没有 macOS/Windows 签名证书的情况下，不适合直接接入 `electron-updater` 的后台下载与重启安装流程。先提供“新版本检测 + 引导用户打开 Release 页面”的能力，可以让用户知道有新版本，同时避免未签名自动更新带来的平台风险。

## What Changes

- 新增 GitHub Release 新版本检测能力：从 FylloCode GitHub 仓库读取最新正式 Release，与当前 `app.getVersion()` 比较。
- 在 About 面板提供新版本检测入口和状态展示：检测中、已是最新、有新版本、检测失败。
- 当发现新版本时，用户可以点击入口打开对应 GitHub Release 页面或下载页面，由用户自行下载安装包。
- 明确不做后台下载安装、不调用 `electron-updater`、不调用 `quitAndInstall()`、不在本次变更中实现重启自动安装。
- 明确不要求 macOS 或 Windows 代码签名；未签名平台只承担用户手动下载安装包的系统提示风险。

## Capabilities

### New Capabilities

- `release-version-check`: 定义应用如何检查 GitHub 最新正式 Release、比较版本、返回检测状态与打开入口信息。

### Modified Capabilities

- `settings-about-panel`: 在 About tab 中新增新版本检测入口与可见反馈。

## Impact

- 主进程：新增 release 检测 service，并通过现有 Settings IPC 暴露检测能力。
- 共享契约：新增 Release 检测返回类型、Settings channel、IPC schema 和错误码。
- 预加载与渲染：扩展 `settings` bridge/API/store，并在 `SettingsAbout.vue` 展示检测结果与打开 Release 入口。
- 测试：覆盖版本比较、GitHub 响应解析、IPC 失败归一化、About 面板状态展示。
- 文档/规范：更新构建或 About 相关 guideline，说明当前能力是“版本检测/引导下载”，不是 electron-updater 自动更新。
