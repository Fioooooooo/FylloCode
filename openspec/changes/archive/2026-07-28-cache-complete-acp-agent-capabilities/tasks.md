## 1. Shared capability snapshot contract

- [x] 1.1 Update `src/shared/types/acp-agent.ts` to type-only import `AuthMethod`, `PromptCapabilities`, `McpCapabilities`, and `SessionCapabilities` from `@agentclientprotocol/sdk`, then add `AcpAgentCapabilitySnapshot` and `AcpAgentCapabilityCache` containers with optional SDK fields plus required `capturedAgentVersion` and `capturedAt`; keep `AcpPromptCapabilities` and `normalizePromptCapabilities()` as the existing UI projection.
- [x] 1.2 Update the return types in `src/preload/api/platform/acp-agents.ts` and `src/renderer/src/api/platform/acp-agents.ts` so `loadCapabilitiesCache()` returns `AcpAgentCapabilityCache` and `ensureAgent()` returns `AcpAgentCapabilitySnapshot`, without adding a second channel or prompt-only compatibility API.

## 2. Versioned persistence and capture

- [x] 2.1 Refactor `src/main/infra/storage/agent-capability-store.ts` to support version 2 entries containing the four SDK-shaped fields, preserve `_meta` and unknown nested extension fields with passthrough/loose Zod schemas, and expose a complete `upsertAgentCapabilities` operation while retaining cache path and atomic temp-file rename behavior.
- [x] 2.2 Add a read-only version 1 compatibility path in `agent-capability-store.ts` that returns prompt-only partial snapshots without inventing missing auth/MCP/session fields or rewriting the file during read; keep missing, damaged, and unsupported documents non-fatal, and write a version 2 envelope only when a later initialize-driven upsert or other cache mutation occurs.
- [x] 2.3 Serialize `upsertAgentCapabilities`, `removeAgentCapabilities`, and `removeCustomAgentCapabilities` read-modify-write operations inside `agent-capability-store.ts` so concurrent Agent initialize completions preserve all entries and a rejected mutation does not block later mutations.
- [x] 2.4 Extend `test/main/infra/storage/agent-capability-store.test.ts` to cover full SDK-shaped round trips, nested `_meta` and unknown-field preservation, optional field absence, a first v1 read that does not rewrite disk, initialize-driven v2 writeback with untouched Agents retained as partial snapshots, damaged/unsupported documents, concurrent updates, failed-mutation queue recovery, and existing Agent/custom-Agent removal behavior.
- [x] 2.5 Update `src/main/infra/process/acp-process-pool.ts` to pass `initializeResponse.authMethods` and the three selected `initializeResponse.agentCapabilities` fields to `upsertAgentCapabilities` after successful initialize; update `test/main/infra/process/acp-process-pool.spec.ts` and/or `.test.ts` to assert complete capture while preserving best-effort persistence and ready-state behavior.

## 3. Main service and IPC contract

- [x] 3.1 Refactor `ensureAgent()` in `src/main/services/platform/acp-agent/acp-agent-service.ts` to return `AcpAgentCapabilitySnapshot`: return a version-matching cached snapshot with the existing lazy start, or construct the same shape from the live process `InitializeResponse` on cache miss/version mismatch; retain custom Agent empty-version matching and current error semantics.
- [x] 3.2 Update `test/main/services/platform/acp-agent/acp-agent-service.test.ts` and `.spec.ts` mocks/assertions for complete cached/live snapshots, version matching, lazy start, custom Agents, uninstall removal, and persistence-failure-independent live results.
- [x] 3.3 Remove the prompt-only `Object.fromEntries` projection from `src/main/ipc/platform/acp-agents.ts` so `PlatformAcpAgentChannels.loadCapabilitiesCache` returns `loadCache()` unchanged; extend `test/main/ipc/platform/acp-agents.test.ts` to verify auth, prompt, MCP, session and `_meta` fields cross the handler without trimming.

## 4. Renderer compatibility

- [x] 4.1 Refactor `src/renderer/src/stores/platform/acp-agents.ts` so `loadCapabilitiesCache()` and `refreshCapabilities()` store complete per-Agent snapshots, expose that state through the store public return, and delete the complete snapshot on Agent unavailable.
- [x] 4.2 Preserve the existing renderer prompt contract by deriving `promptCapabilitiesByAgent` and/or `getPromptCapabilities()` from each snapshot through `normalizePromptCapabilities()`, keeping all three booleans, missing-Agent false defaults, current component call sites, session probe cleanup, and attachment behavior unchanged.
- [x] 4.3 Extend `test/renderer/src/stores/platform/acp-agents.spec.ts` to verify complete snapshot receipt/storage (including `_meta`), ensure refresh replacement, unavailable cleanup, v1-promoted/missing optional fields, and unchanged prompt selector/default behavior; existing component tests SHALL require no production component changes.

## 5. Validation

- [x] 5.1 Before project commands in the linked worktree, run `sh scripts/prepare-worktree-env.sh` once as required by `AGENTS.md`.
- [x] 5.2 Run the focused main and renderer Vitest files covering storage, process pool, service, IPC, and ACP Agent store; all new and existing cases SHALL pass.
- [x] 5.3 Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`; allow the first linked-worktree full lint sufficient cold-cache time. Do not run `pnpm build` unless the user gives explicit build authorization in the Apply session, and report that build was skipped when no authorization was given.
