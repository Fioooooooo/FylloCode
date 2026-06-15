## Context

`fyllo-cortex` 是 FylloCode 桌面端打包的内置 stdio MCP server，目前只暴露一个 `guidelines` 工具。当前实现 (`mcp-servers/fyllo-cortex/src/tools/guidelines.ts`) 入参为 `z.object({}).strict()`，每次调用都加载 `instructions/guidelines.md`（约 210 行）作为 `<tool_instruction>` 返回。spec 中明确要求该工具不读仓库、不返回任何 discovery 结果。

实际使用中存在两类场景：

1. **写作场景**：agent 准备创建或修改用户项目里的 guideline 文档，需要拿到完整的写作合约。
2. **查阅场景**：agent 想根据当前任务判断"项目里有没有相关的 guideline 文档"，从而决定是否需要 Read 全文。

把两类场景合并成同一种返回，导致查阅场景每次都要拉 200 行写作合约，对上下文是巨大浪费；同时 agent 从工具响应里完全得不到用户项目实际 guideline 信息，引导 agent 主动维护项目 guidelines 的能力被埋没。

## Goals / Non-Goals

**Goals:**

- 在不破坏 `fyllo-cortex` 单工具结构的前提下，把 `guidelines` 拆成 read / write 双行为。
- 让 read 行为相对 `Glob guidelines/*.md` 提供真正的增量信号——文档摘要 + 关键词，使 agent 可以跳过不相关文档、只 Read 命中文档。
- 允许 frontmatter 缺失或损坏：read 行为对老仓库（无 frontmatter）必须可用，不强制迁移。
- 在 instruction 中规定 frontmatter 的字段集合与建议性，使生态逐步收敛。
- tool description 必须能让 agent 从描述中看出"什么时候 mode=read，什么时候 mode=write"。

**Non-Goals:**

- 不在本次 change 内迁移 FylloCode 自身 `guidelines/*.md` 增加 frontmatter（属于另一个 change 范围）。
- 不动 FylloCode 主进程注入的 system-reminder、CLAUDE.md 模板，或 Chat 阶段对 `guidelines` 的引用文案。
- 不引入新依赖。
- 不为 read 输出附带 hint / suggestion 字符串字段——agent 由 description + instruction 引导，不在每次 read 响应里塞额外提示。

## Decisions

### 1. 入参形态：`{ mode: "read" | "write" }`，必填、无默认

**选用**：必填、无默认值。

**对比**：

- 默认 `mode=read`：兼容老调用，但旧调用方今天得到的是 instruction，悄悄改语义会让 agent 行为反转，且无法在工具描述里清楚区分两种模式的触发时机。
- 默认 `mode=write`：保住老返回但与"读优先"的高频场景反向。
- 必填无默认：迫使 agent 显式选择行为，工具 description 可以以"两种模式"为骨架；调用方一旦升级会立刻收到清晰的输入校验错误。

接受**轻微 BREAKING**换行为契约清晰。`fyllo-cortex` 仅在 FylloCode 自身打包内使用，调用方可控。

### 2. read 输出条目 schema

```ts
type GuidelineEntry = {
  path: string; // 相对项目根的 POSIX 路径，如 "guidelines/Architecture.md"
  name: string | null; // 来自 frontmatter.name；缺失时回退为文件名 stem
  description: string | null;
  keywords: string[] | null;
  parseError?: string; // 仅在 frontmatter 存在但 YAML 解析失败时出现
};
```

**选用**：仅暴露上述 5 个字段，其中 `parseError` 为可选；`hasFrontmatter` 字段 **不** 暴露（信息冗余，`description: null` 已能驱动 agent 决策）。

对未识别的 frontmatter 字段：**透传忽略**，不进入返回结构，也不报错。

子目录策略：递归扫描 `guidelines/**/*.md`，`path` 如实保留嵌套，例如 `guidelines/frontend/Routing.md`。不做扁平化、不做按目录的分组聚合。

排除策略：不做特殊文件名过滤；如果用户在 `guidelines/` 下放了 README/INDEX 等文件，让其作为普通条目返回。

`name` 回退规则：

- frontmatter 存在且 `name` 是非空字符串 → 使用该值
- 其他情况（无 frontmatter / `name` 缺失 / 类型错误）→ 文件名 stem（去掉 `.md`）

### 3. read 顶层响应结构

每次 read 调用返回一个 JSON 文本块：

```json
{
  "guidelines": [
    { "path": "...", "name": "...", "description": "...", "keywords": [...] }
  ]
}
```

**选用**：以 `guidelines` 数组为唯一根字段，便于未来在不破坏外层结构的前提下扩展（比如增加 `projectRoot` 之类元信息）。**不**附带 hint / suggestion 字段。

返回内容仍包装在 MCP `content: [{ type: "text", text: <stringified JSON> }]` 单条 text 块里，与现有 MCP 工具响应惯例一致；不使用多 content block。

排序：按 `path` 字典序升序，保证 agent 多次调用结果稳定，便于人工 diff。

### 4. write 输出 = 现有 instruction（含 frontmatter 描述）

**选用**：`mode=write` 输出与今天的 `<tool_instruction>...</tool_instruction>` 完全同构，仅在 `instructions/guidelines.md` 内的 `## Guideline Document Format` 章节里把 frontmatter 直接加入文档模板示例并附简短说明。理由是 write 是"准备写文档前的合约下载"，与现状一致最小化改动面，frontmatter 与文档结构属于同一层抽象（"一篇 guideline 长什么样"），不必另起一节。

### 5. frontmatter 解析

**选用**：手写 ~10 行解析器，复用项目已有的 `js-yaml@^4.1.1`（见 `package.json` dependencies）。

```ts
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
```

- 文件首部必须是 `---\n` 才尝试解析；否则视为无 frontmatter。
- `js-yaml.load()` 抛错 → 该条目 `parseError` 写错误 message 摘要，其余字段全部为 `null`/stem 回退。
- 解析结果非对象（如 yaml 顶层是数组、字符串）→ 视为无 frontmatter（`parseError` 描述类型错误）。

**不选** `gray-matter`：附带 stringify、cache、template 等本场景不需要的能力，多一个依赖换 ~5 行代码不划算。

### 6. tool description 重写

新 description（最终措辞由实现时打磨，但语义需要包含三点）：

- 工具用于 read 或 maintain 用户项目的 repository guidelines。
- `mode=read`：发现项目已有的 guideline 文件并读取它们的元信息（name / description / keywords），用于决定要不要进一步 Read 完整文档。
- `mode=write`：拿到 guideline 文档的写作合约，用于创建或修改 `guidelines/*.md` 时遵循统一格式。

### 7. 项目根路径来源

read 模式需要项目根路径才能扫描 `guidelines/`。**选用**：以 MCP server 启动时 `process.cwd()` 作为项目根，与 `fyllo-cortex` 现有架构（不接受 `targetPath` 入参）保持一致。

不接受任何路径相关入参，以保留"无项目特定参数"的设计原则——只新增 `mode` 这一个枚举入参，避免逐步把工具变成多入参 API。如未来发现 cwd 不准确，再单独评估。

## Risks / Trade-offs

- **BREAKING：旧调用方传 `{}` 会失败** → 迁移 FylloCode 内对该工具的所有调用点（实际只有 agent prompt 引用），并在 PR 描述里说明；接受短期破坏换长期清晰。`fyllo-cortex` 仅在 FylloCode 桌面端打包中使用，影响面可控。
- **read 输出依赖 cwd** → 如果 MCP server 进程的 cwd 与项目根不一致，会得到空数组或错误目录的扫描结果。Mitigation：在 instruction 中说明 read 输出的 `path` 一律相对当前项目根；FylloCode 主进程在启动 MCP server 时已经把 cwd 设到项目根（沿用现状）。
- **frontmatter 自由形态可能漂移** → 用户可能写 `tags`、`category` 之类异名字段，read 输出无法识别。Mitigation：write 模式 instruction 明确字段集合与命名；不识别的字段被忽略而非报错，避免阻塞用户。
- **大型仓库递归扫描成本** → `guidelines/` 通常只有十几个文件，但理论上递归无上限。Mitigation：第一版不加并发或 cache；如未来出现性能问题再补 LRU 或软上限。

## Migration Plan

1. 实现 input schema 与 dispatch；老调用方传 `{}` 会立刻收到 zod 校验错误，错误信息将清楚指出 `mode` 是必填字段。
2. 同步更新工具描述，agent 在重新拉取 `tools/list` 时即可看到双模式说明。
3. 升级 spec：`fyllo-cortex-mcp` 的两条原 SHALL 在本次 change 内 MODIFIED 改写；archive 时随之入主分支 spec。
4. 项目里现有 `guidelines/*.md` 在本次 change 内不补 frontmatter，read 模式将以"无 frontmatter"形态返回；这是预期行为。

## Open Questions

无。所有契约维度均已收敛。
