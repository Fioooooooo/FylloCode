# settings-about-panel Specification

## Purpose

TBD - created by archiving change add-settings-about-version. Update Purpose after archive.

## Requirements

### Requirement: About tab 展示应用级信息入口

系统 SHALL 在 `Settings` 内提供只读 `About` tab，并展示应用级信息，而不要求用户先打开项目。

#### Scenario: 无项目时访问 About

- **WHEN** 用户在未打开任何项目时进入 `/settings` 并切换到 `About`
- **THEN** About 内容正常显示
- **AND** 内容不依赖当前项目上下文

### Requirement: About tab 沿用现有 Settings 卡片布局

系统 SHALL 沿用现有 `Settings` 页的视觉语言来展示 About 内容，而不是渲染成独立品牌页。About 内容 SHALL 由顶部标题说明区和一个单独的 `UCard` 信息卡片组成；信息卡片 SHALL 通过分隔线拆成四行：版本、版权、GitHub 首页、反馈。

#### Scenario: About 页结构稳定

- **WHEN** 用户进入 `About` tab
- **THEN** 顶部可见 About 标题和简短说明文字
- **AND** 下方可见单个信息卡片
- **AND** 信息卡片按顺序展示版本、版权、GitHub 首页、反馈四行内容

#### Scenario: 版本信息具有视觉主次

- **WHEN** 用户查看信息卡片中的版本行
- **THEN** 右侧同时显示发布渠道标识和版本号文本
- **AND** 版本号是该卡片中的主要识别信息之一

### Requirement: About tab 展示当前版本与发布渠道

系统 SHALL 在 `About` tab 中展示当前运行应用的版本号和发布渠道。版本号 SHALL 来源于主进程的应用元数据，而不是渲染进程硬编码字符串。

#### Scenario: 展示当前版本号

- **WHEN** About tab 完成加载
- **THEN** 用户可以看到当前运行版本号
- **AND** 版本号与打包应用元数据一致

#### Scenario: 展示 Preview 渠道

- **WHEN** 当前构建属于 Preview 渠道
- **THEN** About tab 同时显示 `Preview` 渠道标识

### Requirement: About tab 展示版权与仓库链接

系统 SHALL 在 `About` tab 中展示版权信息、GitHub 首页链接和反馈链接。反馈链接 SHALL 指向项目公开仓库的 issue tracker。

#### Scenario: 访问 GitHub 首页

- **WHEN** 用户点击 GitHub 首页链接
- **THEN** 系统在默认浏览器中打开 FylloCode 的 GitHub 仓库主页
- **AND** 应用内当前路由不跳离 `/settings`

#### Scenario: 访问反馈入口

- **WHEN** 用户点击反馈链接
- **THEN** 系统在默认浏览器中打开 FylloCode 仓库的 issue tracker
- **AND** 应用内当前路由不跳离 `/settings`

### Requirement: About tab 对应用信息加载失败提供可见反馈

系统 SHALL 在 `About` 信息尚未加载完成时展示加载态，并在应用信息读取失败时展示明确的错误兜底，而不是留空白区域。

#### Scenario: About 信息加载中

- **WHEN** 用户首次进入 `About` tab 且应用信息请求尚未完成
- **THEN** About 面板显示明确的加载态

#### Scenario: About 信息加载失败

- **WHEN** 应用信息请求失败
- **THEN** About 面板显示可读的错误提示
- **AND** 版本号区域不以硬编码占位值冒充真实结果

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
