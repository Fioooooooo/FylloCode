import FylloSignalNode from "../ui/FylloSignalNode.vue";
import { analyzeFylloSignalMarkdown } from "@shared/fyllo-signal/parser";
import type { FylloSignalMarkdownAnalysis } from "@shared/fyllo-signal/protocol";
import {
  createFylloTagNodeTransformer,
  prepareFylloTagMarkdown,
  type FylloTagPostTransformNodes,
  type PreparedFylloTagMarkdown,
} from "@renderer/components/shared/markstream/fyllo-tag";

export { FylloSignalNode };

const INTERNAL_FYLLO_SIGNAL_TAG = "fyllo-signal-render";
const fylloSignalTransportConfig = {
  publicTagName: "fyllo-signal",
  internalTagName: INTERNAL_FYLLO_SIGNAL_TAG,
  placeholderNamespace: "FYLLO_SIGNAL_LITERAL",
} as const;

export const fylloSignalMarkstreamCustomHtmlTags = [INTERNAL_FYLLO_SIGNAL_TAG] as const;

export type PreparedFylloSignalMarkdown = PreparedFylloTagMarkdown<FylloSignalMarkdownAnalysis>;

export function prepareFylloSignalMarkdown(
  source: string,
  analysis: FylloSignalMarkdownAnalysis = analyzeFylloSignalMarkdown(source)
): PreparedFylloSignalMarkdown {
  return prepareFylloTagMarkdown(source, analysis, fylloSignalTransportConfig);
}

export function createFylloSignalNodeTransformer(
  prepared: Pick<PreparedFylloSignalMarkdown, "placeholders">
): FylloTagPostTransformNodes {
  return createFylloTagNodeTransformer(prepared, fylloSignalTransportConfig);
}
