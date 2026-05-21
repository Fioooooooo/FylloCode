## ADDED Requirements

### Requirement: ACP sessions receive both bundled Fyllo MCP servers

When bundled MCP is enabled, ACP session creation and recovery SHALL receive both bundled Fyllo MCP servers from `getBundledMcpServers({ projectPath })`: `fyllo-specs` and `fyllo-skills`.

This requirement applies to `connection.newSession({ cwd, mcpServers })`, `connection.resumeSession({ sessionId, cwd, mcpServers })`, and `connection.loadSession({ sessionId, cwd, mcpServers })`. ACP session code SHALL continue to treat `getBundledMcpServers({ projectPath })` as the only source of bundled MCP descriptors and SHALL NOT hard-code either server in `services/chat/acp-session.ts`.

#### Scenario: newSession receives specs and skills servers

- **WHEN** `AcpSession.start` creates a fresh ACP session and bundled MCP is not disabled
- **THEN** `connection.newSession({ cwd, mcpServers })` receives an `mcpServers` list containing one spec with `name === "fyllo-specs"`
- **AND** the same list contains one spec with `name === "fyllo-skills"`

#### Scenario: resumeSession receives specs and skills servers

- **WHEN** session recovery calls `connection.resumeSession({ sessionId, cwd, mcpServers })` and bundled MCP is not disabled
- **THEN** the `mcpServers` list contains one spec with `name === "fyllo-specs"`
- **AND** the same list contains one spec with `name === "fyllo-skills"`

#### Scenario: loadSession receives specs and skills servers

- **WHEN** session recovery calls `connection.loadSession({ sessionId, cwd, mcpServers })` and bundled MCP is not disabled
- **THEN** the `mcpServers` list contains one spec with `name === "fyllo-specs"`
- **AND** the same list contains one spec with `name === "fyllo-skills"`

#### Scenario: disable flag removes both bundled servers from ACP sessions

- **WHEN** `FYLLO_DISABLE_BUNDLED_MCP=1`
- **AND** `AcpSession.start` creates or recovers an ACP session
- **THEN** the `mcpServers` list passed to ACP is empty
- **AND** neither `fyllo-specs` nor `fyllo-skills` is included
