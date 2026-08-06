## MODIFIED Requirements

### Requirement: HTTP capability grant 绑定 activation 主体与 server scope

Main SHALL为每次 `fyllocode` draft probe、`newSession`、`resumeSession`、`loadSession`或 fresh fallback的 HTTP MCP activation签发独立、不可猜测的 opaque bearer token。production默认签发的 grant SHALL将 `expiresAt`固定为`2099-12-31T23:59:59.999Z`，使已绑定 activation在正常应用生命周期内不因固定小时级 TTL失效；内存 registry SHALL只保存 token hash，并将其绑定到唯一 `activationId`、可选 Fyllo/ACP Session identity、`workspaceId`、允许的 bundled server names、不可变 descriptor、`issuedAt`与`expiresAt`。明文 token SHALL NOT被持久化、记录日志、返回 renderer或写入 MCP tool output。实现 SHALL保留基于`expiresAt`的授权拒绝与惰性移除机制，并 MAY通过显式测试依赖签发更短有效期的 grant，但 production调用方 SHALL NOT覆盖固定远期日期。`native` Chat/probe SHALL不创建 HTTP grant、activation descriptor或 stdio bundled MCP配置。

#### Scenario: 两个 FylloCode Session 获得不同 capability

- **WHEN** 同一应用运行中的两个 `fyllocode` ACP Session使用相同 bundled server与相同 Workspace
- **THEN** Main SHALL为两个 activation签发不同 token
- **AND** 每个 token SHALL只解析到自身 registry grant

#### Scenario: Token 只能访问 allowlist server

- **WHEN** 有效 token请求不在 `allowedServerNames`内的 bundled server
- **THEN** Main proxy SHALL拒绝请求
- **AND** SHALL NOT将请求转发给任何 backend

#### Scenario: Production grant 使用固定远期日期

- **WHEN** Main为正常 `fyllocode` draft probe、`newSession`、`resumeSession`、`loadSession`或 fresh fallback创建 HTTP MCP activation
- **THEN** grant的`expiresAt` SHALL等于`2099-12-31T23:59:59.999Z`
- **AND** 同一 activation在签发一小时后仍 SHALL通过 token与 server allowlist校验

#### Scenario: 显式短期 grant 过期

- **WHEN** 测试或内部受控调用显式签发短期 grant且请求时刻已超过其`expiresAt`
- **THEN** registry SHALL将其视为无效并移除 grant
- **AND** proxy SHALL NOT注入或暴露该 grant的 descriptor

#### Scenario: Native activation 不签发 capability

- **WHEN** Main为 `native` Chat或 probe准备任一 ACP lifecycle request
- **THEN** grant registry SHALL NOT新增该 activation的记录
- **AND** Agent SHALL NOT收到 HTTP token、proxy endpoint或 stdio `FYLLO_WORKSPACE_JSON`
