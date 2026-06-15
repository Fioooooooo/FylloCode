## Context

当前 `fyllo-skills` 是 FylloCode 随应用分发的 bundled MCP server，源码位于 `src/mcp-servers/fyllo-skills/`，测试位于 `test/mcp-servers/fyllo-skills/`。主进程通过 `src/main/infra/mcp/bundled-mcp-servers.ts#getBundledMcpServers()` 将它注入 ACP `newSession` / `resumeSession` / `loadSession`，构建脚本通过 `scripts/build-mcp-servers.mjs` 输出 `out/mcp-servers/fyllo-skills/index.js`。

`fyllo-skills` 目前只提供 `guidelines` 工具，但产品定位已经变化：该 server 未来会作为 FylloCode 的“大脑”承载核心工具。继续保留 `skills` 命名会让 agent 可见工具 namespace、文档和后续能力边界都误导为“技能集合”。

## Goals / Non-Goals

**Goals:**

- 将当前 bundled MCP server 从 `fyllo-skills` 完整重命名为 `fyllo-cortex`。
- 更新 runtime MCP server `name`、ACP `mcpServers[].name`、tool namespace、source/test path、bundle path、spec capability 名称和当前文档引用。
- 保持 `guidelines` tool 的行为契约不变：`mode=read` / `mode=write` 输入输出、prompt markdown 维护方式、guideline 扫描规则都不改变。
- 最终活跃代码、测试、文档、guidelines 和当前 OpenSpec specs 中不再出现 `fyllo-skills` 字符串；本 change 的 proposal artifacts 可以保留旧名用于说明重命名来源。

**Non-Goals:**

- 不新增 `fyllo-cortex` 的第二个工具。
- 不改变 `guidelines` tool 的 schema、返回结构、扫描算法或 guideline 文档 contract。
- 不保留 `fyllo-skills` runtime alias，也不同时注入 `fyllo-skills` 与 `fyllo-cortex` 两个 MCP server。
- 不改变 `fyllo-specs` 的 OpenSpec CLI env、bundle 方式或工具契约。

## Decisions

### D1: Runtime 身份使用硬切换，不保留旧 alias

`getBundledMcpServers()` SHALL 返回 `name === "fyllo-cortex"` 的第二个 bundled server，`src/mcp-servers/fyllo-cortex/src/server.ts` SHALL 创建 `new McpServer({ name: "fyllo-cortex", version })`。system-reminder 模板 SHALL 引用 `mcp__fyllo_cortex__guidelines` / `fyllo-cortex.guidelines`。

保留 alias 的替代方案被拒绝：它会让 agent 看到两个等价 server 或旧 namespace，违背“完全重命名”的目标，并增加后续工具归属判断的歧义。

### D2: 源码、测试和 bundle path 与 server name 同步

目录 `src/mcp-servers/fyllo-skills/` SHALL 重命名为 `src/mcp-servers/fyllo-cortex/`，测试目录 `test/mcp-servers/fyllo-skills/` SHALL 重命名为 `test/mcp-servers/fyllo-cortex/`。构建输出 SHALL 从 `out/mcp-servers/fyllo-skills/index.js` 改为 `out/mcp-servers/fyllo-cortex/index.js`，生产资源路径同步为 `app.asar.unpacked/mcp-servers/fyllo-cortex/index.js`。

只改 server metadata、不改目录的替代方案被拒绝：目录名和 bundle path 是项目文档与测试契约的一部分，保留旧目录会导致后续 agent 和维护者继续沿用旧名。

### D3: OpenSpec capability 采用“旧 capability 撤回 + 新 capability 建立”

`fyllo-skills-mcp` 是以旧 server 名命名的 capability。为了满足“所有 fyllo-skills 命名都改为 fyllo-cortex”，本次 change SHALL 删除当前 `openspec/specs/fyllo-skills-mcp/` capability，并新增 `fyllo-cortex-mcp` capability 承接同一 `guidelines` 工具行为。

只在 `fyllo-skills-mcp/spec.md` 内把正文改成 `fyllo-cortex` 的替代方案被拒绝：spec 目录名本身仍含旧名，不符合完整重命名目标。用 `REMOVED Requirements` 表达整个旧 capability 删除的替代方案也被拒绝：当前 OpenSpec archive runtime 会把旧 spec 重建为空 spec，而空 spec 无法通过归档校验。

### D4: 文档与参考资料以全仓搜索收口

实现阶段 SHALL 更新 README、docs 站点、docs reference 文件名与导航、guidelines、CHANGELOG、archived OpenSpec changes、ACP reference traces 和测试 fixture 中的旧名。当前 `openspec/specs/**` 通过本 change 的 delta specs 与 Archive 阶段更新；Apply 阶段不直接手改当前 specs。验收以 `git grep -n "fyllo-skills" -- .` 人工复核为准：除本 change artifacts 和 Archive 前尚待归档更新的当前 specs 外，活跃 source/docs 不得保留旧名。生成物目录 `out/`、`dist/` 不参与手工修改。

只更新当前用户文档、不动历史 reference 的替代方案被拒绝：用户明确要求“所有 fyllo-skills 的地方”都改成 `fyllo-cortex`，保留历史文本会让最终 grep 无法证明完成度。

## Risks / Trade-offs

- **Risk: 旧会话或 agent 记录仍引用 `fyllo-skills` namespace** → Mitigation: 本次不做 alias；已有会话恢复后只会收到新的 bundled MCP descriptor。旧文本记录若被展示，仅作为历史消息内容，不作为可调用 tool contract。
- **Risk: 大范围文本替换误伤历史语义** → Mitigation: Apply 阶段先执行精确 grep，按代码、spec、docs、references 分组替换；替换后运行测试并再次 grep。
- **Risk: OpenSpec capability rename 不能完全由 archive 自动表达** → Mitigation: `fyllo-cortex-mcp` 通过 ADDED delta 创建；旧 `openspec/specs/fyllo-skills-mcp/` 当前 spec 文件作为普通当前规范删除纳入同一 git change，避免 archive runtime 生成空 spec。
- **Risk: system-reminder 测试只断言旧 namespace** → Mitigation: 同步更新 `test/main/services/chat/system-reminder/*.spec.ts` 断言 `mcp__fyllo_cortex__guidelines` / `fyllo-cortex.guidelines`，并断言旧名不存在。

## Migration Plan

1. 重命名源码和测试目录，更新 import、tsconfig include、Vitest exclude/coverage 配置。
2. 更新 bundled MCP build registry 和 main-process registry，使 dev/prod bundle path 与 ACP descriptor 都指向 `fyllo-cortex`。
3. 更新 MCP server metadata、version 常量命名、CHANGELOG 标题和 tests。
4. 更新 system-reminder 模板与测试中的 tool namespace。
5. 更新 OpenSpec change artifacts、docs、README、guidelines、references、CHANGELOG 和 diagrams；删除当前 `openspec/specs/fyllo-skills-mcp/`，由 `fyllo-cortex-mcp` delta 在 Archive 时创建新 capability spec。
6. 运行 `pnpm build:mcp-servers`、相关 Vitest、`pnpm typecheck`、`pnpm lint`，最后用 `git grep -n "fyllo-skills" -- .` 复核旧名只出现在本 change artifacts 或 Archive 前尚待归档更新的当前 specs 中。

Rollback 方式是反向恢复目录名、registry 名称、bundle path、system-reminder namespace 和文档引用。由于不涉及数据迁移或持久化格式，回滚不需要用户数据处理。

## Open Questions

无。
