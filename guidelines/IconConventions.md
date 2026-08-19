---
name: Icon Conventions
description: Governs renderer icon semantics that establish stable user mental models across product surfaces.
keywords: [icons, semantics, renderer, ui, lucide]
---

# Icon Conventions

## 范围

- 覆盖：renderer 中表达稳定领域身份、对象角色、共享状态语义和跨组件认知的图标，以及它们在 `src/renderer/src/config/semantic-icons.ts` 中的维护方式。
- 不覆盖：只承担一次性操作提示的 close、chevron、panel open 等局部 affordance；一次性 loading spinner 也可以由拥有该状态的组件就地定义。

## 规则

- MUST 使用项目现有的 Lucide 图标集合和 Nuxt UI 图标入口；不得手写 SVG 图标或在同一语义跨组件复用时重复声明图标字符串。
- MUST 将会**形成稳定用户心智模型**的身份、领域角色和共享状态图标登记在 `src/renderer/src/config/semantic-icons.ts` 的 `semanticIcons` registry 中，再由消费者引用。
- MUST 把 registry 当作产品视觉词汇维护：新增或替换语义图标时，必须检查所有消费者、对应文案、浅色/深色主题和相关测试，不得只修改单个入口。
- MUST 区分身份、状态和操作三种语义。身份图标保持稳定，状态图标可以随状态变化，操作图标只表达当前交互；不得用一个局部操作图标冒充领域身份。
- SHOULD 只有在相同语义需要跨两个以上产品表面保持一致时才提升到 registry；局部且无稳定心智模型的图标无需为了集中而集中。

## 示例

- ✅ `src/renderer/src/config/semantic-icons.ts`：集中维护跨表面的语义图标条目。
- ✅ `src/renderer/src/components/chat/message/SubagentCallCard.vue`：通过 `semanticIcons.subagentIdentity` 显示子 Agent 身份。
- ✅ `src/renderer/src/pages/workflow.vue`：通过 `semanticIcons.workflow` 显示 Workflow 空状态。
- ✅ `src/renderer/src/features/spawned-session-inspector/ui/SpawnedSessionActivityEntry.vue`：通过同一条目显示底部后台活动入口，并继续使用独立的状态呈现逻辑显示 Session 状态。
- ❌ 在业务组件中直接写入 `i-lucide-bot` 或 `i-lucide-workflow`，或让 Workflow 与子 Agent 共享同一个身份图标。

## 验证

```bash
pnpm exec vitest run --project renderer test/renderer/src/features/spawned-session-inspector/ui/spawned-session-background-entry.spec.ts test/renderer/src/components/shared/ui-message-list.spec.ts
pnpm typecheck:web
pnpm lint
```
