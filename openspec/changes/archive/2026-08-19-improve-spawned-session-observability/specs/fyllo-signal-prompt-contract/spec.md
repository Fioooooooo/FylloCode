## ADDED Requirements

### Requirement: spawn.session只作为可选详情深链

Generated `spawn.session` prompt contract SHALL将Signal描述为可选的上下文详情深链，并 SHALL明确Main-owned spawned Session发现、状态更新、历史和底部活动栏不依赖父Agent输出Signal。Contract SHALL NOT要求父Agent在`prompt_to_agent`新建、同步完成、background accepted或continuation后输出Signal。

当父Agent认为在当前assistant message中保留新建Session上下文入口有价值时 MAY输出一次owner-matched`spawn.session`；该可选输出仍 SHALL遵守公共standalone block、空白行、strict JSON、opaque sessionId和同一assistant response最多一次的规则。Continuation、capacity结果与没有Session identity的RPC失败不需要Signal。

#### Scenario: Background新建未输出Signal

- **WHEN** 父Agent省略sessionId调用background`prompt_to_agent`并收到包含新Session identity的accepted结果，但没有输出`spawn.session`
- **THEN** generated contract SHALL不把该行为描述为违规
- **AND** Main-owned底部活动栏和owner-scoped inspection SHALL仍发现并更新该Session

#### Scenario: 可选输出上下文深链

- **WHEN** 父Agent在新建Session的assistant response中选择输出一次合法`spawn.session`
- **THEN** Signal SHALL继续解析为所处父Session下的opaque详情入口
- **AND** SHALL不成为Session创建、状态或授权事实源

#### Scenario: Continuation不需要重复Signal

- **WHEN** 父Agent向已有sessionId发送后续Prompt
- **THEN** contract SHALL不要求重复输出Signal
- **AND** 同一Session SHALL通过Main list和最新Turn恢复active状态

## REMOVED Requirements

### Requirement: spawn.session只在prompt_to_agent新建调用后输出一次

**Reason**: Agent生成的Markdown不是可靠的Session发现和运行状态通道；Main已拥有durable owner-scoped list/detail与view wake。

**Migration**: 保留`spawn.session`协议、payload和renderer兼容性，将输出时机改为新的可选详情深链要求；现有历史Signal无需改写。

#### Scenario: 旧必需输出指导被移除

- **WHEN** 生成新的Signal prompt contract
- **THEN** contract SHALL不再要求新建Session后输出Signal
- **AND** SHALL继续说明可选Signal的格式与无副作用边界
