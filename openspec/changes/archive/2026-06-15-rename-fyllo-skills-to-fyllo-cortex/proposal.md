## Why

`fyllo-skills` 这个名称已经不能表达该 bundled MCP server 的长期定位：它将作为 FylloCode 的“大脑”承载核心工具，而不只是技能或 guideline 工具集合。为了避免 runtime 名称、工具 namespace、文档和后续能力设计继续绑定旧概念，需要一次完整重命名为 `fyllo-cortex`。

## What Changes

- **BREAKING**: 将 bundled MCP server 的 runtime 名称从 `fyllo-skills` 改为 `fyllo-cortex`，不保留 `fyllo-skills` 作为 MCP server alias。
- **BREAKING**: 将 agent 可见的 guidelines 工具 namespace 从 `mcp__fyllo_skills__guidelines` / `fyllo-skills.guidelines` 改为 `mcp__fyllo_cortex__guidelines` / `fyllo-cortex.guidelines`。
- 将源码目录、测试目录、构建 registry、主进程 bundled MCP registry、bundle 输出路径、Vitest 配置、system-reminder 模板与相关测试中的旧名统一改为 `fyllo-cortex`。
- 将 OpenSpec capability `fyllo-skills-mcp` 撤回，并以 `fyllo-cortex-mcp` 承接相同的 `guidelines` 工具契约与未来核心工具扩展定位。
- 更新当前 README、docs、guidelines、OpenSpec specs、CHANGELOG、reference 资料和示意图中的 `fyllo-skills` 文本，确保活跃代码、测试、文档和当前规范不再依赖旧名；本 change 的 proposal artifacts 允许保留旧名用于描述重命名来源。

## Capabilities

### New Capabilities

- `fyllo-cortex-mcp`: 定义 `fyllo-cortex` bundled MCP server 的 runtime 名称、源码位置、`guidelines` 工具契约、prompt 维护方式、server metadata 与测试要求。

### Modified Capabilities

- `bundled-mcp-servers`: 将 bundled MCP server 集合、源码路径、bundle 输出路径、启动描述符、env 差异和 disable 场景中的第二个 server 从 `fyllo-skills` 改为 `fyllo-cortex`。
- `acp-chat-backend`: 将 ACP session 注入的 bundled MCP server 名称从 `fyllo-skills` 改为 `fyllo-cortex`。
- `system-reminder-injection`: 将 chat/apply/archive reminder 中的 guidelines tool routing 从 `fyllo-skills.guidelines` 改为 `fyllo-cortex.guidelines`，并同步工具调用名称。
- `desktop-packaging`: 将生产包中必须保留的 bundled MCP server bundle 从 `fyllo-skills` 改为 `fyllo-cortex`。

## Impact

- 代码：`scripts/build-mcp-servers.mjs`、`src/main/infra/mcp/bundled-mcp-servers.ts`、`src/main/services/chat/system-reminder/templates/*.txt`、`src/mcp-servers/fyllo-skills/**`、`test/mcp-servers/fyllo-skills/**`、相关主进程测试与 Vitest 配置。
- 契约：MCP server `name`、ACP `mcpServers[].name`、bundle 路径 `out/mcp-servers/fyllo-cortex/index.js`、tool namespace `mcp__fyllo_cortex__guidelines`、当前 `openspec/specs/fyllo-skills-mcp/` capability 删除。
- 文档：README、docs 站点、docs reference 页面和导航、guidelines 中的 MCP server examples、CHANGELOG、OpenSpec 当前 specs、reference 资料中的旧名引用。
- 验证：`pnpm build:mcp-servers`、相关 MCP/main/system-reminder 测试、`pnpm typecheck`、`pnpm lint`，以及 `git grep -n "fyllo-skills" -- .` 人工复核旧名只出现在本 change artifacts 或 Archive 前尚待归档更新的当前 OpenSpec specs 中。
