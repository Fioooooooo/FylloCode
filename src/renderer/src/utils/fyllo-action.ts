// Re-export Fyllo action parsing utilities from the shared package so renderer code
// can import them through the local `@renderer/utils` alias instead of `@shared`.
export {
  buildChatFylloActionId,
  collectFylloActionSources,
  parseFylloActionNode,
} from "@shared/utils/fyllo-action";
export type {
  ChatFylloActionIdInput,
  FylloActionMarkdownNode,
  ParsedFylloActionSource,
} from "@shared/utils/fyllo-action";
