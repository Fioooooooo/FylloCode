## MODIFIED Requirements

### Requirement: HTTP capability grant 绑定 activation 主体与 server scope

Main SHALL 为每次 draft probe、`newSession`、`resumeSession`、`loadSession` 或 fresh fallback 的 HTTP MCP activation 签发独立、不可猜测的 opaque bearer token。production默认签发的 grant SHALL 将 `expiresAt` 固定为`2099-12-31T23:59:59.999Z`，使已绑定 activation在正常应用生命周期内不因固定小时级TTL失效；内存registry SHALL只保存token hash，并将其绑定到唯一`activationId`、可选Fyllo/ACP Session identity、`workspaceId`、允许的bundled server names、不可变descriptor、`issuedAt`与`expiresAt`。明文token SHALL NOT被持久化、记录日志、返回renderer或写入MCP tool output。实现 SHALL保留基于`expiresAt`的授权拒绝与惰性移除机制，并 MAY通过显式测试依赖签发更短有效期的grant，但production调用方 SHALL NOT覆盖固定远期日期。

#### Scenario: 两个 Session 获得不同 capability

- **WHEN** 同一应用运行中的两个 ACP Session 使用相同 bundled server 与相同 Workspace
- **THEN** Main SHALL 为两个 activation 签发不同 token
- **AND** 每个 token SHALL 只解析到自身 registry grant

#### Scenario: Token 只能访问 allowlist server

- **WHEN** 有效 token 请求不在 `allowedServerNames` 内的 bundled server
- **THEN** Main proxy SHALL 拒绝请求
- **AND** SHALL NOT 将请求转发给任何 backend

#### Scenario: Production grant 使用固定远期日期

- **WHEN** Main 为正常 draft probe、`newSession`、`resumeSession`、`loadSession` 或 fresh fallback 创建 HTTP MCP activation
- **THEN** grant的`expiresAt` SHALL等于`2099-12-31T23:59:59.999Z`
- **AND** 同一activation在签发一小时后仍 SHALL通过token与server allowlist校验

#### Scenario: 显式短期 grant 过期

- **WHEN** 测试或内部受控调用显式签发短期grant且请求时刻已超过其`expiresAt`
- **THEN** registry SHALL将其视为无效并移除grant
- **AND** proxy SHALL NOT注入或暴露该grant的descriptor

### Requirement: Grant 随 ACP activation 生命周期撤销与重签

系统 SHALL 让grant覆盖其绑定ACP activation的多轮prompt与多次MCP请求。正常`done`、terminal `error`、由stream finalise触发的MessagePort自关闭以及ACP `session/cancel` SHALL只结束当前prompt turn，SHALL NOT关闭ACP Session、调用`forgetActiveAcpSession()`或撤销已绑定grant。系统 SHALL在`session/close`、activation替换、probe丢弃、Agent process invalidation、bundled MCP host停止或应用退出时立即幂等撤销grant。`resumeSession`、`loadSession`与fresh recovery SHALL只在既有activation因上述真实生命周期边界不再active时签发新token，SHALL NOT因普通turn终态重签；有效direct prompt与probe-to-chat promotion SHALL复用其当前绑定grant，不签发未被Agent使用的额外token。

#### Scenario: Probe 提升复用 grant

- **WHEN** ready probe 的 ACP Session 被匹配的 Chat Session consume
- **THEN** probe 的 activation grant SHALL 转移给同一个 ACP Session
- **AND** Main SHALL NOT 因 promotion 签发第二个 token

#### Scenario: 连续多轮复用 active grant

- **WHEN** 一个prompt以done或terminal error结束且对应Agent process、ACP Session与MCP activation仍active
- **THEN** stream终态关闭 SHALL NOT触发runner cancel或撤销grant
- **AND** 下一轮direct prompt SHALL复用同一个activation与token

#### Scenario: Prompt turn 被取消

- **WHEN** renderer在prompt完成前停止stream并使Main发送ACP `session/cancel`
- **THEN** Agent SHALL取消当前prompt turn
- **AND** Main SHALL保留该ACP Session的active标记与已绑定MCP grant
- **AND** 下一轮prompt SHALL NOT仅因上轮取消进入cold recovery或重签token

#### Scenario: 未绑定 activation 在取消时清理

- **WHEN** prompt在`newSession`、`resumeSession`或`loadSession`完成并绑定MCP activation之前被取消
- **THEN** 本次未绑定grant SHALL被立即幂等撤销
- **AND** 系统 SHALL NOT把从未完成的activation标记为active

#### Scenario: Cold recovery 重签 token

- **WHEN** persisted ACP Session因应用或Agent process重启、真实Session关闭、activation替换或host生命周期切换而没有active grant
- **THEN** 系统 SHALL NOT直接发送prompt
- **AND** SHALL通过resume/load/fresh recovery创建新的activation并签发新token

#### Scenario: Session 关闭或替换

- **WHEN** 系统调用`session/close`、fresh fallback以新ACP Session替换旧Session，或Agent process被invalidate
- **THEN** 旧activation grant SHALL立即失效
- **AND** 使用旧token的后续请求 SHALL被拒绝

#### Scenario: Host 重启

- **WHEN** bundled MCP host 停止后重新启动
- **THEN** registry 中此前签发的全部 HTTP grants SHALL 失效
- **AND** 新 activation SHALL 使用新的 capability 与内部 backend token
