## MODIFIED Requirements

### Requirement: Bundled MCP server 分发契约保持不变

系统 SHALL 在打包瘦身后继续通过 `extraResources` 将 `out/mcp-servers` 分发到 app 的 asar 外部资源目录，使 `fyllo-specs` 与 `fyllo-cortex` 在生产环境可作为外部 Node 文件启动。系统 MUST NOT 因瘦身将 bundled MCP server bundle 放入 `app.asar` 内部或删除其生产启动所需文件。

#### Scenario: MCP server bundle 仍在 asar 外部

- **WHEN** electron-builder 生成任一平台生产包或解包产物
- **THEN** 产物中存在 asar 外部的 `src/mcp-servers/fyllo-specs/index.js`
- **AND** 产物中存在 asar 外部的 `src/mcp-servers/fyllo-cortex/index.js`
- **AND** 两个文件不位于 `app.asar` 内部
