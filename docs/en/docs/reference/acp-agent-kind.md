---
sidebar:
  group: Reference
  order: 40
---

# ACP Agent Kinds

FylloCode injects `__fyllo.kind` into Agents from the ACP registry to help users understand how an Agent relates to local CLIs, official products, or bridge tools.

There are currently three kinds:

| kind | Definition |
| --- | --- |
| `native` | A native ACP Agent with a complete implementation and no external command-line dependency. |
| `adapter` | An independent adapter implementation that can share config or environment variables with the related native CLI, but does not call the local CLI at runtime. |
| `bridge` | A bridge layer that calls a local command-line tool through mechanisms such as `spawn` at runtime. |

## native

`native` means the ACP Agent itself is a complete implementation. It does not depend on an official CLI already installed by the user, and it does not call that CLI at runtime.

Examples:

- `glm-acp-agent`
- `agoragentic-acp`

## adapter

`adapter` means there is a clear official Agent or CLI mental anchor from the user's perspective, but the ACP package itself is an independent implementation and does not perform work through a local CLI subprocess.

Known adapters:

- `claude-acp`
- `codex-acp`
- `amp-acp`

The key is user expectation. If users naturally ask "I installed Claude Code / Codex CLI / Amp CLI, should FylloCode detect it?", and the ACP package does not call the local CLI at runtime, classify it as `adapter`.

## bridge

`bridge` means the ACP Agent is only a bridge layer, and actual work depends on a local command-line tool.

Known bridge:

- `pi-acp`

## Maintenance Rules

When adding or reclassifying an ACP Agent, update:

- `guidelines/Domain.md`
- `src/main/domain/acp/agent-kind-map.ts`

If there is no explicit mapping, FylloCode defaults the Agent to `native`.
