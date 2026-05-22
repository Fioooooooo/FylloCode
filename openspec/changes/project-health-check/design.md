## Context

FylloCode 是纯 prompt 驱动的 harness，自身没有执行能力。所有对用户项目的分析和修改都依赖 agent。

当前 `meta.json`（`ProjectMeta`）只存储 id、name、path、createdAt、lastOpenedAt 五个字段，没有任何健康度信息。AppHeader 中央区域只有 ProjectSelector，右侧只有 Bell 和主题切换按钮。

健康检查的执行路径：FylloCode 提供入口 → 用户确认 → 自动发起新 chat session（预置消息）→ agent 走标准 chat → proposal → apply → archive 流程 → apply 阶段 agent 写入 `meta.json` 的 `healthScore` → FylloCode 读取并更新 icon 颜色。

## Goals / Non-Goals

**Goals:**

- `meta.json` / `ProjectMeta` / `ProjectInfo` 新增 `healthScore: number`（可选，默认 0）
- AppHeader 中央区域 ProjectSelector 旁新增健康度 icon，颜色随分值变化
- 点击 icon 弹出 Popover，用户确认后自动发起健康检查 chat session
- 自动发起的 session 预置两条消息：system-reminder（前端隐藏）+ 用户口吻消息

**Non-Goals:**

- FylloCode 自身不做任何项目文件扫描
- 不新增 IPC 通道（复用 `project:update`）
- 不修改 system-reminder-injection 的主进程路径（健康检查 session 的 system-reminder 由前端动态注入）
- 不实现健康检查 agent 的具体评分逻辑（由 agent 自主决定）

## Decisions

**决策 1：healthScore 存在 meta.json，不引入新文件**

- 理由：用户明确要求不在用户项目内增加 `.fyllo` 等文件；`meta.json` 在 userData 目录，与用户项目完全隔离
- 备选方案：`.fyllo/governance-state.json` 放在用户项目内 → 被否决

**决策 2：healthScore 由 agent 写入，不由 FylloCode 自动翻转**

- 理由：FylloCode 没有可靠的"健康检查完成"信号；agent 通过 `project:update` IPC 写入是最直接的路径
- 风险：agent 可能跳过写入步骤 → 缓解：在预置的 system-reminder 中明确要求 tasks 包含写入 healthScore 的任务

**决策 3：健康检查 session 的 system-reminder 由前端动态注入，不走 chat.txt 模板**

- 理由：健康检查是一次性的特殊 session，内容与常规 chat reminder 不同；修改 chat.txt 会影响所有 chat session
- 实现：前端在发起新 session 时，将 system-reminder 作为第一条消息（`role: "user"`, `parts[0]` 为 reminder text block）直接写入，复用现有消息结构

**决策 4：颜色映射分三档**

- 0：灰色（未检查）
- 1–59：橙色/黄色（需改善）
- 60–100：绿色（健康）
- 理由：简单直观，避免过度设计

**决策 5：Popover 而非 Modal**

- 理由：操作轻量，不需要全屏打断；UPopover 是 @nuxt/ui 的标准组件

## Risks / Trade-offs

- **[风险] agent 写入 healthScore 不稳定** → 缓解：system-reminder 明确要求，tasks.md 中有对应 task；即使漏写，icon 保持灰色，用户可重新触发
- **[风险] 健康检查 session 的 system-reminder 绕过了主进程注入路径** → 可接受：这是前端主动发起的特殊 session，语义上属于"用户发起的带上下文消息"，不是常规 reminder 注入
