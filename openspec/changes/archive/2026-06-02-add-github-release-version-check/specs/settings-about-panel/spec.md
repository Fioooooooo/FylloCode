## ADDED Requirements

### Requirement: About tab 提供新版本检测入口

系统 SHALL 在 `Settings` 的 `About` tab 中提供新版本检测入口，并展示检测状态。检测入口 SHALL 使用主进程返回的应用版本与 GitHub 最新正式 Release 信息，不得在 renderer 中硬编码当前版本或远端版本。

#### Scenario: About 页显示检测入口

- **WHEN** 用户进入 `About` tab 且应用信息加载完成
- **THEN** About 信息卡片中可见新版本检测区域
- **AND** 用户可以触发一次新版本检测

#### Scenario: 检测中展示加载态

- **WHEN** 用户触发新版本检测且请求尚未完成
- **THEN** About 面板展示明确的检测中状态
- **AND** 不清空已加载的应用版本、版权、GitHub 首页和反馈信息

#### Scenario: 检测到新版本时展示打开入口

- **WHEN** 新版本检测返回 `update-available`
- **THEN** About 面板展示最新版本号
- **AND** 展示文案为“查看新版本”的可点击 GitHub Release 打开入口
- **AND** 不再展示“检查新版本”检测按钮
- **AND** 文案不承诺自动下载、自动安装或重启安装

#### Scenario: 当前已是最新时展示成功状态

- **WHEN** 新版本检测返回 `up-to-date`
- **THEN** About 面板展示当前已是最新版本的文案
- **AND** 不展示安装或重启动作

#### Scenario: 检测失败时展示错误与重试入口

- **WHEN** 新版本检测返回 IPC 错误
- **THEN** About 面板展示可读的检测失败文案
- **AND** 用户仍可以再次触发检测
