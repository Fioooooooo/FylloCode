## 1. Event Rail Structure

- [ ] 1.1 Create `src/renderer/src/components/chat/event/ChatSessionEventRail.vue` as the right-side event rail container. It MUST accept `planEntries: PlanEntry[]`, render no visible container when `planEntries.length === 0`, and initially render only the plan event using the existing `ChatPlanPanel` component.
- [ ] 1.2 Update `src/renderer/src/components/chat/ChatContainer.vue` to import `ChatSessionEventRail`, remove the bottom `ChatPlanPanel` render between the message list and `ChatPromptPanel`, and restructure the main content into a horizontal layout with a left conversation column and right session rail.
- [ ] 1.3 Ensure the conversation column contains `ChatMessageList` / `ChatMessageSkeleton` / `ChatEmptyAgentPicker`, `ChatStreamError`, and `ChatPromptPanel` so the message list and prompt keep the same width and horizontal alignment when the rail appears.
- [ ] 1.4 Implement the rail as a layout sibling that squeezes the conversation column instead of overlaying it. The rail MUST NOT auto-hide due to narrow width; at the current app minimum window width it should remain visible when plan entries exist, with the conversation column narrowed.
- [ ] 1.5 Add local manual collapse state to `ChatSessionEventRail.vue` or its immediate container. When expanded, render a collapse button at the rail header's left edge near the column divider; when collapsed, render a narrow right-edge handle that restores the rail. Do not persist this state and do not add IPC or session meta fields.

## 2. Plan Panel Migration

- [ ] 2.1 Reuse `src/renderer/src/components/chat/plan/ChatPlanPanel.vue` inside the event rail without changing `PlanEntry`, `Session.plan`, `useSessionStore.setSessionPlan`, or chat stream `plan_update` handling.
- [ ] 2.2 If `ChatPlanPanel.vue` spacing is too wide for the rail, make only minimal style adjustments in that component so it fits the rail while preserving the existing title, progress count, collapsed state behavior, status icons, priority labels, and empty-array hidden behavior.
- [ ] 2.3 Verify manually in the running app that an active session with plan entries shows the plan in the right-side event rail, that the old bottom plan location is gone, that `ChatPromptPanel` remains aligned with the message column, and that a draft session or session without plan does not show the rail.

## 3. Tests And Verification

- [ ] 3.1 Update `test/renderer/src/components/chat-container.spec.ts` to assert that `ChatContainer` renders `ChatSessionEventRail` for non-draft sessions with plan entries, keeps `ChatPromptPanel` inside the conversation column rather than below both columns, does not render the old bottom plan position, and does not render the rail in draft mode.
- [ ] 3.2 Add or update a focused component test for `ChatSessionEventRail.vue` under `test/renderer/src/components/` to cover non-empty plan rendering, empty plan hidden behavior, manual collapse, and re-expand from the right-edge handle.
- [ ] 3.3 Run `pnpm vitest run test/renderer/src/components/chat-container.spec.ts` and the new/updated event rail component spec.
- [ ] 3.4 Run `pnpm typecheck:web`.
