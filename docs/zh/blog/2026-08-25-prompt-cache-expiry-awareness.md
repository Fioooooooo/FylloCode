---
title: Prompt Cache 过期之后，Coding Agent 应该告诉用户什么
description: 从 Kimi Code、Claude Code、Windsurf 和 Pi 的实现出发，讨论 Coding Agent 如何把缓存过期从隐藏成本变成可见、可判断、可处理的用户状态。
sidebar:
  order: 12
---

# Prompt Cache 过期之后，Coding Agent 应该告诉用户什么

在一个已经积累了十几万 token 的 Coding Agent 会话里，用户离开一段时间，回来只输入一句“继续”。界面看起来只是增加了两个字，模型端却可能重新处理整段对话历史。

这不是上下文丢失。Agent 仍然知道之前发生了什么，回答质量也未必下降。真正发生变化的是计费和延迟：服务端保存的 Prompt Cache 已经过期，原本可以按缓存读取价复用的前缀，需要重新计算并写入缓存。对长会话来说，一条很短的新消息也可能触发一次很大的未缓存输入。

多数 Coding Agent 过去把这件事当作模型服务的内部细节。用户发送消息，等响应回来后，最多在用量统计里看到 cache read 归零。问题是，账已经产生了。**Cache miss 的事后记录能解释成本，却不能帮助用户在成本发生前做决定。**

最近几款 Agent 和客户端开始采用另一种设计：把 Prompt Cache 是否仍然有效，提升为用户提交消息前就能看到的会话状态。

## 先区分四种看起来相似的机制

围绕 Prompt Cache 的功能经常被放在一起讨论，但它们介入用户决策的时间完全不同。

| 层级 | 典型表现 | 用户能否避免本次冷缓存成本 |
| --- | --- | --- |
| 事后观测 | 响应结束后显示 cache miss、命中率或重计费 token | 不能 |
| 到期可见 | 显示 TTL 倒计时，过期后改变状态 | 可以，但要靠用户自己处理 |
| 发送前预警 | 提交时提示缓存已过期，以及下一轮可能重新处理的上下文规模 | 可以 |
| 决策拦截 | 暂停发送，提供压缩、新会话或原样继续等选项 | 可以，而且恢复路径明确 |

Aider 的 keep-alive、Pydantic AI Harness 的 `CacheBustWarning`、VS Code 的 Cache Explorer 都有价值，但不属于同一种产品机制。Keep-alive 试图阻止缓存过期；`CacheBustWarning` 和 Cache Explorer 用于请求后的诊断。本文更关心后两层：**Agent 是否在消息发出前知道缓存已冷却，并把代价和选择交还给用户。**

## Kimi Code：目前最完整的发送前决策链

Kimi Code 在 [PR #2646](https://github.com/MoonshotAI/kimi-code/pull/2646) 中加入了 Cache Expiry Hint。它会在两种场景触发：恢复一个长时间闲置的会话，以及当前进程中的会话闲置较久后再次提交消息。

这套实现最值得注意的并不是弹窗，而是弹窗之前的判断过程。

首先，TTL 没有写死在客户端。Kimi Code 从公开的 `client_configs` 接口读取 `estimated_cache_duration`，按模型获得 `cache_duration` 和 `min_tokens_to_hint`。只有闲置时间越过对应模型的缓存期限，而且当前上下文达到提示门槛，才会打扰用户。当前实现只对 OAuth 管理的 provider 生效；缺少模型、用量或服务端配置时会跳过提示，而不是伪造一个确定的缓存状态。

其次，它记录的是实际 LLM 往返，而不是所有本地活动。权限确认、Plan 更新和配置变化可能修改会话文件，但并不会刷新服务端缓存。Kimi Code 在恢复会话时只从 message 和 compaction 记录计算 `lastActiveAt`；运行中的会话也只有完成一次 provider 请求才更新活动时间。对应代码可以在 [`cache-hint-controller.ts`](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-code/src/tui/controllers/cache-hint-controller.ts) 中核对。

当规则命中后，用户原本提交的消息会被暂存，不会先发送再提示。对话框会显示闲置时间和当前上下文 token 规模，并提供四种处理方式：

- 压缩上下文后继续；
- 新建会话后发送；
- 保留完整历史，原样继续；
- 永久关闭这类提示。

取消对话框时，输入会回到编辑器；选择压缩或新会话后，暂存的消息才沿正常发送路径重新进入队列。官方配置文档也将这一行为暴露为默认开启的 `cache_expiry_hint` 设置。[Kimi Code 配置文档](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/configuration/config-files.md#tuitoml)

这使 Kimi Code 的处理形成了一条完整链路：服务端提供 TTL，客户端识别真实模型活动，提交入口暂缓消息，界面解释即将发生的成本，用户选择恢复方式。它不只是“提醒缓存过期”，而是在一次可能昂贵的请求前增加了 preflight。

## Claude Code：已经接近，但没有覆盖所有过期场景

Claude Code 的演进说明，缓存状态正在从调试信息进入正式交互。

[v2.1.84](https://github.com/anthropics/claude-code/releases/tag/v2.1.84) 加入了 idle-return prompt：用户离开 75 分钟以上再返回时，客户端会建议使用 `/clear`，减少为陈旧会话重新建立缓存的成本。

[v2.1.92](https://github.com/anthropics/claude-code/releases/tag/v2.1.92) 又向前走了一步。Pro 用户回到 Prompt Cache 已经过期的会话时，会在底部看到提示，其中包含下一轮预计以未缓存方式发送的 token 数。这个版本还修复了 `/clear to save X tokens` 使用累计会话 token、而不是当前上下文大小的问题。

当前 Claude Code 文档进一步确认，客户端掌握每类请求实际使用的 TTL：订阅计划额度内的主会话通常使用一小时，API Key、云 provider、超出计划后使用 usage credits 的主会话通常是五分钟；新版本还提供 `promptCacheTtl` 和 `subagentPromptCacheTtl`，让用户选择五分钟或一小时。对于模型切换、插件重载等会导致下一轮完整重读的操作，Claude Code 也会结合缓存是否仍然有效决定是否确认或阻止。[Claude Code Prompt Caching 文档](https://code.claude.com/docs/en/prompt-caching)

不过，Claude Code 仍不是覆盖所有请求的发送前 gate。v2.1.84 明确记录的 idle-return 阈值是 75 分钟，v2.1.92 的 footer hint 明确提到 Pro 用户；在使用五分钟 TTL 的大上下文中，仍有用户在 v2.1.114 报告闲置 45 分钟后没有得到发送前警告。[Claude Code #51218](https://github.com/anthropics/claude-code/issues/51218)

因此，更准确的评价不是“Claude Code 没有缓存过期提示”，而是：**它已经具备 TTL-aware 的成本提示和 `/clear` 恢复建议，但提示范围与当前请求真正采用的 TTL 还没有完全对齐。**

## Windsurf：把缓存剩余时间放进上下文指标

Windsurf 选择了一种更常驻的表达方式。2026 年 4 月，Windsurf 将 Prompt Cache Timer 直接集成到上下文窗口指标中，让用户在发送下一条消息之前就能看到缓存剩余时间；每次响应后的卡片还会展示 token 数，解释该消息的成本构成。[Windsurf 官方博客](https://windsurf.com/blog/windsurf-adaptive)

官方文章没有详细说明倒计时归零后的交互。Windsurf v2.3.9 的用户实测显示，悬停用量指标时可以看到剩余 TTL，归零后文案会变成 `Prompt cache has expired. Higher cost expected.`。这条证据来自用户报告，不等同于官方行为规范，但能确认产品界面已经存在“有效、倒计时、已过期”的状态变化。[Windsurf 用户报告](https://www.reddit.com/r/windsurf/comments/1tjpybl/prompt_cache_expires_while_the_agent_is_running/)

Windsurf 的优点是状态持续可见，而不是等用户按下发送才突然弹窗。局限也很明确：目前没有证据表明它会估算下一轮重新处理多少 token，或直接提供压缩、新会话等操作。它把风险展示出来，但仍由用户自己推导下一步。

## Pi：社区扩展从实际请求载荷推导 TTL

Pi 核心的 `showCacheMissNotices` 属于事后告知：请求完成后，根据用量判断是否发生了显著 miss，并估算重计费 token 和金额。最近出现的社区扩展 [`@siddr/pi-cache-expiry-warning`](https://www.npmjs.com/package/@siddr/pi-cache-expiry-warning) 则把时机提前到了下一轮之前。

扩展会检查实际发给 provider 的请求载荷，识别 Anthropic、Bedrock 和 OpenAI 的缓存控制字段，再从请求发出时间启动对应的计时器。短缓存默认按五分钟处理；载荷中出现一小时或 24 小时 retention 时，则采用实际序列化的 TTL。倒计时结束后，警告显示在编辑器上方，不会写入模型上下文。

这套机制没有 token 估算和动作菜单，却提供了一个重要的工程参考：**不要只读取环境变量，也不要通过 cache read 归零反推过期；应该尽量从最终出站请求确认本轮真正采用的缓存策略。** 自定义 provider 没有序列化可识别的 TTL 时，该扩展选择不显示提示，这比给出一个看似精确但可能错误的倒计时更可靠。

## 第三方壳层正在补主流 Agent 留下的空白

开源项目 [Better Agent Terminal](https://github.com/tony1223/better-agent-terminal) 在 Claude Code SDK 外层实现了另一套完整度很高的 Cache Cost Awareness：

- 可选的浮动倒计时，同时显示五分钟和一小时 TTL；
- 每 30 秒更新，闲置一分钟后出现；
- 保存每轮 cache read/write 和按模型计算的成本历史；
- 当超过 15 万 cached token、且缓存已过期超过一小时后，在发送前弹出确认。

它不是一个独立的模型 Agent，而是 Agent 客户端，但这恰好说明问题所在：当底层 Agent 没有提供完整的成本保护时，上层宿主仍然可以根据会话 usage、TTL 和提交事件补上一道防线。对于同时承载多种 Agent 的桌面应用，这类机制甚至更适合放在统一的会话层，而不是分别等待每个 Agent 实现。

## 一个可靠的 Cache Expiry UX 至少需要什么

综合这些实现，发送前提示不能只靠一个 `setTimeout`。客户端至少要回答五个问题。

### 1. 这一轮实际采用什么 TTL

同一产品里的主会话、子 Agent、API Key、订阅额度和额外付费流量，可能使用不同 TTL。优先级应当是最终请求载荷、服务端下发配置、明确的 provider 能力，最后才是客户端默认值。

### 2. 哪个时间点真正刷新了缓存

输入框活动、权限审批和本地状态写入都不算。只有真正到达 provider、并建立或命中缓存的模型请求，才能刷新过期时间。请求失败、被 Hook 拦截或尚未发出时，不应提前重置倒计时。

### 3. 是 TTL 到期，还是前缀被破坏

切换模型、改变 effort、修改工具定义或重排系统提示，都可能让仍在 TTL 内的缓存失效。时间判断只能识别“可能到期”，usage 能识别“已经 miss”，稳定的客户端还需要记录模型、effort、工具集合和缓存 key 的变化，才能给出不同原因。

### 4. 用户真正承担多大的风险

“缓存已过期”对 2,000 token 和 200,000 token 会话的意义完全不同。提示至少应展示可能重新处理的上下文 token；如果客户端掌握确定的 provider 价格，还可以进一步给出成本区间。估算无法覆盖 gateway、路由切换或服务端策略时，应明确写“预计”而不是伪装成账单。

### 5. 提示之后能做什么

只有警告、没有恢复动作，会把技术判断再次推给用户。一个可操作的提示至少应该允许：压缩后继续、创建新会话、原样发送和取消。对不想被打断的用户，可以提供“不再提醒”，但不宜默认静默。

理想的界面并不需要解释 Prompt Cache 的全部实现，三行信息已经足够：

```text
Prompt Cache 已过期 12 分钟
下一次请求预计重新处理约 184K token
[压缩后继续] [新建会话] [原样发送] [取消]
```

## Prompt Cache 应该成为会话状态，而不是账单注脚

Kimi Code 目前提供了最完整的决策拦截；Claude Code 已经开始显示未缓存 token 并给出 `/clear` 建议；Windsurf 让 TTL 倒计时持续可见；Pi 社区扩展证明了从最终请求载荷判断 TTL 的可行性；Better Agent Terminal 则展示了统一客户端如何为现有 Agent 补上发送前保护。

这些产品没有采用同一种界面，但方向已经一致：Prompt Cache 不再只是 provider usage 里的一个数字，而是会改变下一次操作成本的会话状态。

对于 Agent 客户端，真正有用的问题不再是“上一轮有没有 miss”，而是：**在用户按下发送之前，我们是否已经知道这次请求会变贵；如果知道，是否给了他一个更便宜、也更符合当前任务阶段的选择。**

## 参考资料

- [Kimi Code PR #2646：Cache Expiry Hint](https://github.com/MoonshotAI/kimi-code/pull/2646)
- [Kimi Code `cache-hint-controller.ts`](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-code/src/tui/controllers/cache-hint-controller.ts)
- [Kimi Code 配置文档](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/configuration/config-files.md#tuitoml)
- [Claude Code v2.1.84](https://github.com/anthropics/claude-code/releases/tag/v2.1.84)
- [Claude Code v2.1.92](https://github.com/anthropics/claude-code/releases/tag/v2.1.92)
- [Claude Code Prompt Caching](https://code.claude.com/docs/en/prompt-caching)
- [Windsurf：Introducing Adaptive](https://windsurf.com/blog/windsurf-adaptive)
- [Pi Cache Expiry Warning](https://www.npmjs.com/package/@siddr/pi-cache-expiry-warning)
- [Better Agent Terminal：Cache Cost Awareness](https://github.com/tony1223/better-agent-terminal#cache-cost-awareness)
