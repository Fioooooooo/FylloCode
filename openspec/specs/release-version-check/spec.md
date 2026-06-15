# release-version-check 规范

## Purpose

定义从 GitHub Release 检测新版本的只读检查能力、打开发布页入口和结构化错误反馈。

## Requirements

### Requirement: 从 GitHub 正式 Release 检测新版本

系统 SHALL 通过主进程请求 FylloCode GitHub 仓库的最新正式 Release，并将远端 release tag 与当前应用版本进行比较。系统 MUST NOT 通过 `electron-updater` 检测更新，也 MUST NOT 读取 electron-builder 生成的 `latest.yml` 作为本能力的数据源。

#### Scenario: 发现新版本

- **WHEN** 当前应用版本为 `0.11.3`，GitHub 最新正式 Release tag 为 `v0.11.4`
- **THEN** 系统返回状态 `update-available`
- **AND** 返回最新版本号 `0.11.4`
- **AND** 返回该 Release 的 GitHub 页面 URL

#### Scenario: 当前版本已经最新

- **WHEN** 当前应用版本为 `0.11.3`，GitHub 最新正式 Release tag 为 `v0.11.3`
- **THEN** 系统返回状态 `up-to-date`
- **AND** 返回当前版本号与最新版本号

#### Scenario: 远端版本低于当前版本

- **WHEN** 当前应用版本为 `0.11.4`，GitHub 最新正式 Release tag 为 `v0.11.3`
- **THEN** 系统返回状态 `up-to-date`
- **AND** 不提示用户安装旧版本

### Requirement: 检测结果不得执行安装行为

系统 SHALL 只返回新版本检测结果和用户可打开的 Release 链接。系统 MUST NOT 下载安装包到本地，MUST NOT 调用 `autoUpdater`，MUST NOT 调用 `quitAndInstall()`，MUST NOT 在检测完成后退出或重启应用。

#### Scenario: 有新版本时只提供打开入口

- **WHEN** 系统检测到新版本
- **THEN** 检测结果包含 `releaseUrl`
- **AND** 系统不启动安装器
- **AND** 系统不退出当前应用

#### Scenario: 用户打开 Release 页面

- **WHEN** 用户点击检测结果中的打开入口
- **THEN** 系统在默认浏览器中打开 GitHub Release 页面
- **AND** 应用内当前页面保持可用

### Requirement: 检测失败提供结构化错误

系统 SHALL 在 GitHub 请求失败、响应格式不符合预期或版本号无法解析时返回结构化 IPC 错误。系统 MUST NOT 因版本检测失败阻塞 About 信息展示或应用主流程。

#### Scenario: GitHub 请求失败

- **WHEN** GitHub latest release 请求失败或返回非 2xx 响应
- **THEN** 系统返回 `RELEASE_CHECK_FAILED` 错误码
- **AND** renderer 可以展示可读的检测失败文案

#### Scenario: 版本号无法解析

- **WHEN** 当前版本或远端 release tag 不是可解析的 `major.minor.patch` 格式
- **THEN** 系统返回 `RELEASE_VERSION_INVALID` 错误码
- **AND** renderer 不提示存在新版本
