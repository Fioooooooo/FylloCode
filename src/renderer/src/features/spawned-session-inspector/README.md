# Spawned Session Inspector

只读展示 spawned Session 的权威 Main 状态。`model/` 负责状态判定、排序、计数和内容投影，`application/` 协调 session domain store 与 interest 生命周期，`ui/` 提供 Signal、Chat footer 活动栏与 Turn-aware Slideover 入口。外部模块只能从根 `index.ts` 导入。
