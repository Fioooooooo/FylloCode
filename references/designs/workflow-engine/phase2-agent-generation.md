# Workflow Engine Phase 2 — Agent 动态生成 + 沉淀复用

状态：draft（仅记录初始设想，未展开详细设计）
日期：2026-08-25

本文档只记录 Phase 2 的范围设想，供后续独立会话展开详细设计时作为起点。详细设计尚未讨论，不要把本文档当作已拍板的方案。

---

## 1. 定位

承接 [phase1-execution-design.md](phase1-execution-design.md) 的运行时地基。Phase 1 里 workflow 只能由用户手写（`source: manual`），Phase 2 让 agent 在对话过程中按 [definition-schema.md](definition-schema.md) 的 YAML schema 动态生成 workflow（`source: agent`）。

## 2. 初始设想（未展开）

- Agent 在对话中根据用户意图，动态生成一份符合 schema 的 workflow YAML。
- 生成后引导用户确认是否将其沉淀为可复用 workflow：
  - 若用户同意持久化，写入正式的 workspace 资产目录（[phase1-execution-design.md](phase1-execution-design.md) 第 8 节的 `workflows/<workflow-id>/definition.yaml`）。
  - 在此之前，按 Phase 1 已定的存储设计，先落在 session 临时目录 `appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml`，用户同意后再 copy 到正式目录。
- 涉及 system-reminder 的改写、reminder 动态注入——需要把 workflow schema/contract 作为结构化 prompt 注入给 agent，类比 `fyllo-action` 的 registry → `prompt.ts` 那套"结构化 contract 渲染为可直接注入的稳定文本"模式（见 [fyllo-action README](../fyllo-action/README.md) 第 4.2 节）。
- 后续对话中，agent 应能检索已沉淀的 workflow 库，优先复用而非重新生成——具体的检索/命中机制未讨论。

## 3. 已知会牵扯到的既有结论（讨论时需要重新核对是否仍然适用）

- Phase 1 确定 agent 与 workflow 的交互走 `fyllo-workflow` MCP server（`list_workflows`/`trigger_workflow`），不经过 `fyllo-action`，理由是 ACP 协议下 tool call 对 client 不透明、无法可靠要求 agent 配合输出标签。Phase 2 新增"生成"这个动作时，若涉及"生成后用带内标签展示一份可确认的 YAML 卡片"，需要重新核对这是否会违反 Phase 1 定下的"不依赖 agent 输出标签"原则，还是这里的场景性质不同（生成后的确认展示，用户是审阅 YAML 内容本身，不是响应一个已经在主进程独立运行的状态机事件）。
- YAML 内容的安全防护在 Phase 1 被明确列为"未来扩展，不是主线"。Phase 2 一旦 agent 开始自己生成 `exec`/`webhook` 这类逃生舱 op，安全边界（命令来源控制、危险命令拦截、idempotencyKey 强制）的紧迫性会显著上升，讨论时应重新评估是否仍能推迟。

## 4. 待后续会话展开的问题（先列不深入）

- Agent 生成 YAML 的触发时机：用户主动要求，还是 agent 判断对话内容适合固化成 workflow 时主动提议？
- 生成产物如何校验：复用 [definition-schema.md](definition-schema.md) 第 9 节的解析期校验规则，但校验失败时（agent 生成了不合法的 YAML）如何反馈给 agent 重新生成，是否需要重试/纠错循环。
- "引导用户选择复用"的具体 UI 交互形态。
- 沉淀后的检索机制：按什么维度匹配当前对话意图与已有 workflow 库（关键词、embedding、还是完全靠 agent 自己判断）。
- Phase 1 里 `fyllo-workflow` MCP server 是否需要新增 `create_workflow`/`save_workflow` 一类工具，还是生成本身走别的信道。
