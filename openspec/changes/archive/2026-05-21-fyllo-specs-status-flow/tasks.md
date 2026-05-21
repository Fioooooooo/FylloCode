## 1. Prompt updates

- [x] 1.1 Update `mcp-servers/fyllo-specs/src/tools/instructions/create-proposal.md` so the creation workflow ends with an explicit `draft` write-back after all required artifacts are done.
- [x] 1.2 Update `mcp-servers/fyllo-specs/src/tools/instructions/explore.md` to state that `explore` is read-only and must not mutate proposal status.
- [x] 1.3 Update `mcp-servers/fyllo-specs/__tests__/prompts.test.ts` to assert the new `draft` finalization step and the read-only `explore` behavior.

## 2. OpenSpec contract

- [x] 2.1 Update `openspec/specs/fyllo-specs-mcp/spec.md` to add the lifecycle contract for `creating -> draft` and the read-only guarantee for `explore`.
- [x] 2.2 Review the proposal detail/list behavior docs for wording consistency, and update them only if they need to mention the new explicit completion step.
