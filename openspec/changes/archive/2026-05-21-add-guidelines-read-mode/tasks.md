## 1. instruction 内容更新

- [x] 1.1 在 `mcp-servers/fyllo-cortex/src/tools/instructions/guidelines.md` 的 `## Guideline Document Format` 章节，在现有 markdown 模板代码块顶部加上 frontmatter 段落，使模板形如：

  ```markdown
  ---
  name: Topic Name
  description: 一句话描述本文档管什么
  keywords: [topic, area]
  ---

  # Topic Name

  ...（保留原有 Purpose / Applicability / Sources of Truth / Rules / Examples / Verification / Maintenance 章节）
  ```

  在该代码块紧后追加一段不超过 3 句的散文，明确：(a) frontmatter 是建议而非强制；(b) `name` / `description` / `keywords` 各自语义；(c) `mode=read` 会读取这三个字段产生项目 guideline 概览。整段散文 **不出现** 以下词：`Chat`、`Proposal`、`Apply`、`Archive`、`OpenSpec`、`worktree`、`commit`。

## 2. 工具实现：input schema 与响应分发

- [x] 2.1 在 `mcp-servers/fyllo-cortex/src/tools/guidelines.ts` 中，将 `guidelinesInputSchema` 改为 `z.object({ mode: z.enum(["read", "write"]) }).strict()`；不为 `mode` 设置默认值。删除 `guidelinesTool()` 这个仅返回 instruction 的导出函数（如其他模块未引用），将其逻辑下沉为内部函数 `buildWriteResponse(): string`。
- [x] 2.2 在同一文件内引入主分发函数 `handleGuidelines(input: { mode: "read" | "write" }): Promise<{ content: [{ type: "text"; text: string }] }>`，由 `mode` 选择 `buildWriteResponse` 或 `buildReadResponse`。`registerTools` 注册的 handler 改为调用该分发函数。
- [x] 2.3 重写 `server.registerTool` 的 `description` 字段，措辞需要包含三点：(a) 该工具用于读或维护项目 repository guidelines；(b) `mode=read` 用于发现已有 guideline 文件并获取每个文件的 `name`/`description`/`keywords`，便于决定是否进一步 Read 全文；(c) `mode=write` 用于在创建/修改 `guidelines/*.md` 时获取写作合约。新 description 不得超过 4 句。
- [x] 2.4 旧 `guidelinesTool()` 导出函数若已被引用，更新所有引用方，使其调用新的内部 `buildWriteResponse` 路径或直接使用 `mode=write` 的工具响应；如未被外部引用，移除该 named export。

## 3. 工具实现：read 模式扫描与 frontmatter 解析

- [x] 3.1 新建文件 `mcp-servers/fyllo-cortex/src/utils/frontmatter.ts`，导出函数 `parseFrontmatter(content: string): { data: Record<string, unknown> | null; parseError?: string }`：以正则 `/^---\r?\n([\s\S]*?)\r?\n---/` 匹配；匹配失败返回 `{ data: null }`；匹配成功后用 `js-yaml` 的 `load` 解析；解析抛错时返回 `{ data: null, parseError: <Error.message 摘要，最多 200 字符> }`；解析结果非 plain object 时返回 `{ data: null, parseError: "frontmatter is not an object" }`。
- [x] 3.2 新建文件 `mcp-servers/fyllo-cortex/src/utils/scan-guidelines.ts`，导出函数 `scanGuidelines(projectRoot: string): Promise<GuidelineEntry[]>`：使用 `node:fs/promises` 的 `readdir({ withFileTypes: true, recursive: true })` 递归遍历 `<projectRoot>/guidelines`；当目录不存在（错误码 `ENOENT`）时返回 `[]`；只收集 `.md` 后缀的常规文件；为每个文件构造 `GuidelineEntry`；按 `path` 字典序升序排序后返回。`path` 一律使用 POSIX 分隔符（`path.posix.join` 或显式 `replace(/\\/g, "/")`）。
- [x] 3.3 在 `scanGuidelines` 中实现 `name` 回退规则：当 frontmatter `name` 为非空字符串时使用其值，否则使用文件名 stem（`path.basename(file, ".md")`）。`description` 仅在 frontmatter `description` 为非空字符串时取值，否则 `null`。`keywords` 仅在 frontmatter `keywords` 为 `string[]` 时取值（每个元素都是字符串），否则 `null`。`parseError` 仅在 `parseFrontmatter` 返回错误时附加。
- [x] 3.4 在 `mcp-servers/fyllo-cortex/src/types.d.ts` 中追加导出类型 `GuidelineEntry`，结构为 `{ path: string; name: string; description: string | null; keywords: string[] | null; parseError?: string }`。
- [x] 3.5 在 `guidelines.ts` 中实现 `buildReadResponse(): Promise<string>`：取 `process.cwd()` 作为项目根，调用 `scanGuidelines`，将结果包装为 `{ guidelines: GuidelineEntry[] }` 后通过 `JSON.stringify(payload, null, 2)` 返回字符串。

## 4. 测试

- [x] 4.1 在 `mcp-servers/fyllo-cortex/__tests__/tools.test.ts` 顶部更新现有"lists only the guidelines tool"测试为：除验证只有一个工具外，验证该工具的 `inputSchema` 中 `mode` 字段为必填、可选值为 `"read" | "write"`，且不允许 unknown key（向 `tools/call` 传 `{ targetPath: "/tmp", mode: "read" }` 应失败）。
- [x] 4.2 修改原有 `returns a tool_instruction block for guidelines` 测试为 `returns a tool_instruction block when mode=write`，调用 `tools/call` 传 `{ mode: "write" }`，断言 `<tool_instruction>` 存在、`<state>` 不存在。再加一条单独的失败用例：传 `{}` 时调用应返回 `isError: true` 或抛出校验错误。
- [x] 4.3 新增测试 `returns guideline entries when mode=read`：在临时目录中以 `node:fs/promises` 创建 `guidelines/A.md`（含完整 frontmatter，`name: "Architecture"`, `description: "x"`, `keywords: ["a","b"]`）、`guidelines/B.md`（无 frontmatter）、`guidelines/Bad.md`（含 `---\n: : :\n---` 这种损坏 frontmatter）、`guidelines/frontend/Routing.md`（含 frontmatter）。在调用前 `process.chdir(tmpDir)`，测试结束后恢复原 cwd（`afterEach` 或 try/finally）。断言：返回 JSON 含 `guidelines` 数组；entries 按 `path` 升序；A 的字段全部从 frontmatter 取值；B 的 `name === "B"`、`description === null`、`keywords === null`、不含 `parseError`；Bad 含非空字符串 `parseError`；嵌套路径条目存在 `path === "guidelines/frontend/Routing.md"`。
- [x] 4.4 新增测试 `returns empty array when guidelines directory missing`：在不存在 `guidelines/` 的临时目录中切 cwd 后调用 `mode=read`，断言响应 JSON 等于 `{ "guidelines": [] }`。
- [x] 4.5 在 `mcp-servers/fyllo-cortex/__tests__/prompts.test.ts` 中（如该文件存在断言 instruction 文本的用例）追加断言：通过 `loadPrompt("guidelines")` 取到的内容包含 `Frontmatter`、`name`、`description`、`keywords` 字样，并仍然不包含 `Chat`/`Proposal`/`Apply`/`Archive`/`OpenSpec`/`worktree`/`commit`。

## 5. 构建与验证

- [x] 5.1 运行 `pnpm build:mcp-servers`，确认 `mcp-servers/fyllo-cortex` 重新打包成功，esbuild 仍然能内联 `instructions/guidelines.md` 文本（验收：构建无 error，产物文件 mtime 已更新）。
- [x] 5.2 运行 `pnpm typecheck`，确认 Node 端类型检查通过，新增 `GuidelineEntry` 类型与 `parseFrontmatter`/`scanGuidelines` 函数无类型错误。
- [x] 5.3 运行 `pnpm test`，确认全部测试通过，特别是 `mcp-servers/fyllo-cortex/__tests__/` 下新增/修改的测试。
- [x] 5.4 运行 `pnpm lint`，确认无新增 lint 错误。

## 6. 文档同步（仅此一处）

- [x] 6.1 更新 `mcp-servers/fyllo-cortex/README.md`（如存在），简述 `mode` 入参与两种返回形态；不超过 15 行；不要复制 instruction 内容。如该 README 不存在则跳过本任务。
