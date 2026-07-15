// Model: pure projections and selectors
export { collectPendingFylloActions, type PendingFylloAction } from "./model/pending-actions";
export {
  isFylloActionResolved,
  requiresFylloActionAttention,
  isFylloActionTerminalState,
} from "./model/selectors";
export { getSessionAttention } from "./model/session-attention";

// Application: dispatcher and execution
export { useFylloActionDispatcher } from "./application/use-fyllo-action-dispatcher";
export { useSessionAttention } from "./application/useSessionAttention";
export {
  createFylloActionExecutionController,
  type TransitionActionPort,
  type TransitionActionsPort,
  type PersistActionStatePort,
} from "./application/execution-controller";
export {
  createFylloActionExecutionRuntime,
  type FylloActionExecutionRuntime,
  type FylloActionExecutionStatus,
} from "./application/execution-runtime";
export {
  createFylloActionRegistrationController,
  getActionState,
  type RegisterActionPort,
  type FylloActionRegistrationController,
} from "./application/registration";
export type {
  FylloActionDispatchContext,
  FylloActionDispatchHandler,
  FylloActionDispatchHandlerMap,
} from "./application/types";

// UI: shell, node, and host context
export { default as FylloActionShell } from "./ui/FylloActionShell.vue";
export { default as FylloActionNode } from "./ui/FylloActionNode.vue";
export {
  fylloActionHostContextKey,
  type FylloActionHostContext,
  type FylloActionOrdinalNode,
} from "./ui/fyllo-action-context";

// 宿主 composition root 应显式导入 /integration 入口，根入口不暴露具体 adapter。
export {
  collectFylloActionRailItems,
  type FylloActionRailContributorItem,
} from "./integration/event-rail";
