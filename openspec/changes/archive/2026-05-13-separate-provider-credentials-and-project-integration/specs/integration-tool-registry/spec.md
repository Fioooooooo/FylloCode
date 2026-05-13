## MODIFIED Requirements

### Requirement: 集成页面按分类展示工具

系统 SHALL 将 /integration 页面按六个阶段分类以固定垂直顺序分组显示：项目管理、源代码控制、CI/CD、部署、通信、可观测性。每个分类 SHALL 有标题和一行描述其在工作流中的作用。每个分类区块的内容组织单位 SHALL 为"已挂载在当前项目该阶段下的 provider 卡片"，而不再是"该阶段所有可用工具的卡片列表"。

#### Scenario: 分类区块按顺序渲染

- **WHEN** 用户导航到 /integration 页面
- **THEN** 页面垂直显示六个分类区块
- **AND** 区块按以下顺序显示：项目管理、源代码控制、CI/CD、部署、通信、可观测性
- **AND** 每个区块内仅呈现当前项目在该阶段已挂载的 provider，不再展示未挂载的全部工具

### Requirement: 每个工具以卡片形式显示在其分类中

系统 SHALL 将当前项目在某阶段已挂载的每个 provider 渲染为卡片。同一分类内的卡片 SHALL 以响应式网格水平排列（根据视口宽度每行 2-3 张）。每个阶段区块底部 SHALL 额外提供一张"添加新平台"按钮式卡片，点击后展示该阶段 manifest 中声明的全部 provider 供用户挂载。

#### Scenario: 已挂载 Provider 卡片以响应式网格渲染

- **WHEN** 用户查看分类区块
- **THEN** 当前项目在该分类下已挂载的 provider 以卡片网格呈现
- **AND** 网格根据可用宽度自适应显示每行 2-3 张

#### Scenario: 用户通过"添加新平台"入口挂载 Provider

- **WHEN** 用户点击分类区块底部的"添加新平台"按钮
- **THEN** 系统弹出面板，列出该阶段 manifest 中声明的全部 provider
- **AND** 已连接的 provider 显示为可直接挂载
- **AND** 未连接的 provider 标注"未连接"并附"去设置连接"跳转链接

### Requirement: 工具卡片显示品牌标识和描述

每个 provider 卡片 SHALL 在正面显示 provider 的品牌 Logo（约 36x36px）、provider 名称和一行能力描述（体现该 provider 在当前阶段所承担的资源类型，例如"云效 · Projex 项目源"）。

#### Scenario: 卡片正面显示 Provider 元数据与当前阶段能力

- **WHEN** 用户查看某阶段的 provider 卡片
- **THEN** 卡片左侧显示 provider Logo
- **AND** 右侧显示 provider 名称与"该 provider 在当前阶段提供的 resourceType"描述

### Requirement: 工具卡片显示连接状态

每个 provider 卡片 SHALL 在右上角显示连接状态徽章。该徽章 SHALL 从 `integration-providers` 层读取，对 /integration 页面而言完全只读。已连接时显示带勾选图标的绿色"已连接"；凭证已过期时显示黄色"凭证已过期"；当对应 provider 意外被从 settings 断开但项目仍有该 provider 的资源选择项时显示灰色"未连接"。/integration 页面 SHALL NOT 提供任何凭证操作入口，点击状态徽章 SHALL 跳转到 settings 的集成提供方 tab 视图。

#### Scenario: 已连接 Provider 显示绿色状态

- **WHEN** provider 在全局 connections.json 中处于已连接状态
- **THEN** 其在 /integration 的卡片显示带勾选图标的绿色"已连接"徽章

#### Scenario: 凭证过期 Provider 显示黄色状态

- **WHEN** provider 被标记为"凭证已过期"
- **THEN** 卡片显示黄色"凭证已过期"徽章
- **AND** 该 provider 下的资源选择操作被禁用
- **AND** 卡片底部提供"去设置中重新连接"跳转链接

#### Scenario: 点击状态徽章跳转到 Settings

- **WHEN** 用户点击 /integration 卡片上的任何连接状态徽章
- **THEN** 系统导航到 settings 的集成提供方 tab 视图
- **AND** 目标页面定位到该 provider 对应的卡片位置

### Requirement: 即将推出的工具视觉上有所区分且不可交互

在 manifest 中标记为"即将推出"的 provider SHALL 不出现在 /integration 的任何阶段卡片列表中，仅出现在"添加新平台"面板中，并以灰色呈现且标注"即将推出"徽章，且 SHALL NOT 可被挂载。

#### Scenario: 即将推出的 Provider 在添加面板中被禁用

- **WHEN** 用户打开"添加新平台"面板
- **AND** 某 provider 在 manifest 中被标记为即将推出
- **THEN** 该 provider 条目以降低透明度渲染
- **AND** 显示"即将推出"徽章
- **AND** 条目不可点击或选中

### Requirement: 用户可按名称搜索工具

系统 SHALL 在 /integration 页面顶部提供搜索输入框。在搜索框中输入文字 SHALL 过滤当前页面可见的 provider 卡片，仅显示 provider 名称匹配搜索文字的卡片。搜索 SHALL 同时作用于"已挂载卡片"与"添加新平台"面板。

#### Scenario: 搜索过滤 Provider

- **WHEN** 用户在搜索框中输入"云效"
- **THEN** 仅名称包含"云效"的 provider 卡片保持可见
- **AND** 不匹配的 provider 卡片在当前视图内被隐藏

## REMOVED Requirements

### Requirement: 用户可按连接状态筛选工具

**Reason**: 新模型下 /integration 仅展示当前项目已挂载的 provider，这些 provider 原则上已经连接；"按连接状态筛选"在新语义下失去意义。全局连接状态筛选若有需要，应改到 settings 的集成提供方页面实现。

**Migration**: 需要按连接状态查看 provider 的用户，应在 settings 的集成提供方 tab 视图中使用（如未来提供）的连接状态筛选能力；在 /integration 上不再提供该筛选入口。
