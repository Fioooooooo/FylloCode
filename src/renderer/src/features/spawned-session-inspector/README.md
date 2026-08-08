# Spawned Session Inspector

只读展示 spawned Session 的权威 Main 状态。`model/` 负责纯投影，`application/` 协调 session domain store，`ui/` 提供 Signal、composer 与 Slideover 入口。外部模块只能从根 `index.ts` 导入。
