# integration-providers 规范

## Purpose

定义第三方 Provider 的全局凭证管理、API Token/OAuth 连接、凭证状态回显与过期探测、内置 Provider 注册和 IPC 查询能力。

## Requirements

### Requirement: Provider 粒度的全局凭证管理入口

系统 SHALL 在应用设置（settings）中提供名为"集成提供方（Integration Providers）"的 tab 视图，作为所有第三方平台凭证的全局管理入口。该视图 SHALL 沿用当前 settings 页的 tab 切换模式，而不要求把整个 settings 重构为子路由。该视图 SHALL 按 provider（平台维度，例如"云效"）组织卡片，每张卡片对应一个 provider 的连接/断开/凭证状态，而不再按工具（如"云效 Projex""云效 Codeup"）分别呈现。

#### Scenario: 用户从 settings 打开集成提供方视图

- **WHEN** 用户在 settings 导航中点击"集成提供方"
- **THEN** 系统切换到 settings 内的"集成提供方"tab 视图
- **AND** 当前视图以卡片列表展示系统支持的所有 provider
- **AND** 每张卡片呈现 provider 的 Logo、名称、连接状态徽章，以及该 provider 可覆盖的阶段能力摘要

#### Scenario: 同一平台的多工具合并为一张 provider 卡片

- **WHEN** 用户查看集成提供方视图
- **AND** 某 provider（如云效）在 manifest 中声明可用于多个阶段（任务管理、源代码控制、CI/CD）
- **THEN** 该 provider 仅以一张卡片出现
- **AND** 卡片元数据中列出其可覆盖的阶段能力（如"任务管理 · 源代码控制 · CI/CD"）

### Requirement: Provider 连接表单支持 API Token 与 OAuth 两种形态

对于使用 API Token 认证的 provider，系统 SHALL 在卡片展开后显示带标签输入字段的表单，每个字段 SHALL 包含帮助文本与帮助链接，并提供"测试连接"与"连接"按钮。对于使用 OAuth 认证的 provider，系统 SHALL 显示"通过 {Provider 名称} 连接"按钮作为入口。对于本次真实实现的 `providerId = "yunxiao"`，连接成功后系统 SHALL 在 `{userData}/integrations/credentials/yunxiao.json` 中至少持久化以下字段：`"x-yunxiao-token"`、`userId`、以及已存在或本次推断得到的 `organizationId`（若可得）；其中 `userId` MUST 来自连接时 `getUser()` 返回的 `user.id`，而不是 `connections.json` 中的 `accountId` 回读结果。

#### Scenario: API Token 形态的 provider 连接流程

- **WHEN** 用户展开一张未连接的 API Token 类型 provider 卡片
- **THEN** 卡片内显示该 provider 所需凭据的输入字段
- **AND** 每个字段带有标签、帮助文本和帮助链接
- **AND** 提供"测试连接"与"连接"按钮

#### Scenario: OAuth 形态的 provider 连接入口

- **WHEN** 用户展开一张未连接的 OAuth 类型 provider 卡片
- **THEN** 卡片内显示"通过 {Provider 名称} 连接"按钮

#### Scenario: 云效 provider 连接成功并补齐云效身份字段

- **WHEN** 用户为 `providerId = "yunxiao"` 输入有效凭据并点击"连接"
- **THEN** 主进程验证通过后将凭证写入 `{userData}/integrations/credentials/yunxiao.json`
- **AND** 同一文件中写入 `userId = getUser().id`
- **AND** 若已存在 `organizationId` 或本次可由 `user.lastOrganization` / `listOrganizations()` 推断出组织 ID，则保留或写入该 `organizationId`
- **AND** 在 `{userData}/integrations/connections.json` 中以 `providerId = "yunxiao"` 记录连接状态
- **AND** connection 记录中的 `accountId` 继续等于 `getUser().id`
- **AND** 卡片状态变为"已连接"，并展示已识别到的账户标识（如登录名或邮箱）

#### Scenario: 连接失败

- **WHEN** 用户输入无效凭据并点击"连接"
- **THEN** 主进程验证失败，不写入任何凭证或连接记录
- **AND** 表单下方显示具体错误信息（如"令牌无效""令牌已过期"）
- **AND** 卡片保持"未连接"状态

### Requirement: 已连接 Provider 支持凭证回显与断开

对于已连接的 provider，系统 SHALL 在卡片展开区显示脱敏后的凭证回显（如 `pt-0fh3****0484`）、已识别到的账户标识，并提供"断开连接"按钮。点击"断开连接" SHALL 清除该 provider 的 credentials 文件内容与 connections 记录。对于 `providerId = "yunxiao"`，这同时意味着系统 SHALL 删除或清空 `{userData}/integrations/credentials/yunxiao.json` 中的 `"x-yunxiao-token"`、`userId`、`organizationId`，而不是只清空 token。

#### Scenario: 重启后凭证状态回显

- **WHEN** 用户重启应用后打开集成提供方视图
- **THEN** 系统从 connections.json 读取已连接 provider 列表
- **AND** 每张已连接 provider 卡片显示"已连接"
- **AND** 展开后显示脱敏的凭证回显值

#### Scenario: 用户断开云效 Provider 连接

- **WHEN** 用户点击已连接的 `providerId = "yunxiao"` provider 的"断开连接"按钮
- **THEN** 主进程删除或清空 `{userData}/integrations/credentials/yunxiao.json` 中的 `"x-yunxiao-token"`、`userId`、`organizationId`
- **AND** 主进程删除 `{userData}/integrations/connections.json` 中对应的 `providerId = "yunxiao"` 记录
- **AND** 卡片状态更新为"未连接"
- **AND** 所有项目中引用该 provider 的资源选择项继续以"已选"状态展示，但被标注为"provider 未连接"不可用

### Requirement: Provider 凭证过期机会式探测

系统 SHALL 在以下时机对已连接 provider 的凭证进行有效性探测：(1) 用户切换到集成提供方 tab 视图时，对所有已连接 provider 发起一次轻量 API 调用（例如 me/whoami 等最低开销 endpoint）；(2) 主进程其他模块调用 provider API 遇到鉴权失败时上报状态；(3) 用户在 /integration 页面拉取 provider 资源列表返回鉴权失败时上报状态。探测到凭证失效 SHALL 将该 provider 标记为"凭证已过期"。系统 SHALL NOT 在后台周期性轮询。

#### Scenario: 用户打开提供方视图时自动检测过期凭证

- **WHEN** 用户切换到 settings 中的"集成提供方"tab
- **THEN** 系统对所有已连接 provider 并发发起轻量探测请求
- **AND** 探测失败且错误为鉴权类（401/403）时，将该 provider 标记为"凭证已过期"
- **AND** 过期 provider 的卡片显示黄色"凭证已过期"徽章与"重新连接"按钮

#### Scenario: 外部模块上报鉴权失败

- **WHEN** 主进程其他模块（例如 /integration 资源拉取、MCP 工具调用）调用某 provider API 遇到 401 或 403
- **THEN** 该模块 SHALL 将该 provider 状态上报为"凭证已过期"
- **AND** 集成提供方视图打开时即时反映该状态

### Requirement: Provider 是代码侧的注册表，不支持用户自定义

系统 SHALL 通过硬编码的 provider manifest 维护 provider 列表。manifest 定义 provider 的 id、名称、Logo、认证类型、所需凭证字段、以及该 provider 能覆盖的阶段能力与对应 resourceType。集成提供方页面 SHALL NOT 允许用户新增或删除 provider 本身，仅允许管理既有 provider 的连接状态。自定义平台的扩展路径由 `integration-custom-mcp` 承担，不通过此 provider 体系。本次真实可连接的 provider SHALL 至少覆盖云效；其余 manifest 条目若缺少主进程实现 SHALL 以 `comingSoon` 状态呈现，不提供真实连接入口。

#### Scenario: Provider 列表为系统内置

- **WHEN** 用户打开集成提供方视图
- **THEN** 系统展示 provider manifest 中声明的全部 provider
- **AND** 页面上不提供"新增 provider"的用户入口

### Requirement: Provider 凭证全局共享，不允许项目级覆盖

已连接 provider 的凭证 SHALL 在该应用所有项目之间共享。系统 SHALL NOT 在任何项目的 /integration 页面上提供项目级别的凭证覆盖入口。这意味着同一 provider 在不同项目中使用的始终是同一套全局凭证。

#### Scenario: 同一 Provider 凭证跨项目一致

- **WHEN** 用户在项目 A 中启用某 provider 的资源并顺利获取
- **AND** 随后切换到项目 B 并引用同一 provider
- **THEN** 项目 B 使用与项目 A 完全相同的凭证访问该 provider，无需重复配置

### Requirement: Provider 域 IPC 通道集中暴露操作能力

主进程 SHALL 通过一组 `integrations:providers:*` 前缀的 IPC 通道向前端暴露 provider 相关操作，至少包括列表查询、连接、断开、过期探测与资源列表拉取。所有通道 SHALL 使用项目现有的请求-响应或流式 IPC 协议，不引入新的通道模式。本次真实资源列表拉取 SHALL 至少覆盖云效 provider。

#### Scenario: 前端查询 Provider 列表

- **WHEN** 集成提供方 tab 视图挂载
- **THEN** 前端通过 `integrations:providers:list` 请求获取 provider manifest 与当前连接状态
- **AND** 主进程返回数据后页面据此渲染卡片

#### Scenario: 前端请求 Provider 资源列表

- **WHEN** 用户在 /integration 页面展开某已连接 provider 的资源选择器
- **THEN** 前端通过 `integrations:providers:listResources` 请求传入 providerId、resourceType 与查询参数
- **AND** 主进程调用对应 provider API 返回资源列表
- **AND** 5 分钟会话内重复请求相同参数时复用缓存结果
