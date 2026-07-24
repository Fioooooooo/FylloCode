import FylloActionNode from "../ui/FylloActionNode.vue";
import { analyzeFylloActionMarkdown, parseFylloActionNode } from "@shared/fyllo-action/parser";
import { buildChatFylloActionId } from "@shared/fyllo-action/identity";
import type {
  FylloActionMarkdownAnalysis,
  RegisterFylloActionInput,
  FylloActionState,
} from "@shared/fyllo-action/protocol";
import {
  createFylloTagNodeTransformer,
  prepareFylloTagMarkdown,
  type FylloTagLiteralPlaceholder,
  type FylloTagPostTransformNodes,
  type PreparedFylloTagMarkdown,
} from "@renderer/components/shared/markstream/fyllo-tag";
import type { FylloActionRegistrationController } from "../application/registration";

export { FylloActionNode };

const PUBLIC_FYLLO_ACTION_OPEN = "<fyllo-action";
const PUBLIC_FYLLO_ACTION_CLOSE = "</fyllo-action>";
const INTERNAL_FYLLO_ACTION_TAG = "fyllo-action-render";
const fylloActionTransportConfig = {
  publicTagName: "fyllo-action",
  internalTagName: INTERNAL_FYLLO_ACTION_TAG,
  placeholderNamespace: "FYLLO_ACTION_LITERAL",
} as const;

export const fylloActionMarkstreamCustomHtmlTags = [INTERNAL_FYLLO_ACTION_TAG] as const;

export interface FylloActionHostContextInput {
  projectId: string;
  sessionId: string;
  messageIndex: number;
  partIndex: number;
  actionStates?: Record<string, FylloActionState>;
  registerAction: (input: RegisterFylloActionInput) => Promise<FylloActionState>;
  persistActionState: (actionId: string, state: FylloActionState) => Promise<void>;
  transitionAction: (input: {
    projectId: string;
    sessionId: string;
    actionId: string;
    command: "succeed" | "fail" | "cancel";
    expectedRevision: number;
    error?: string;
  }) => Promise<FylloActionState>;
  transitionActions: (input: {
    projectId: string;
    sessionId: string;
    actionIds: string[];
    command: "succeed" | "fail" | "cancel";
    expectedRevisions: Record<string, number>;
    error?: string;
  }) => Promise<
    Array<{ actionId: string; success: boolean; record?: FylloActionState; error?: string }>
  >;
}

export type FylloActionLiteralPlaceholder = FylloTagLiteralPlaceholder;

export interface FylloActionOrdinalNode {
  type?: string;
  raw?: string;
  content?: string;
}

export type PreparedFylloActionMarkdown = PreparedFylloTagMarkdown<FylloActionMarkdownAnalysis>;

/**
 * 将 shared Markdown analysis 中已经闭合且语义合法的 Action 注册到 Main。
 * 注册直接消费 candidate 的 sourceOrdinal，避免等待 UI node 挂载后再重新推导身份。
 */
export async function registerPreparedFylloActions(
  prepared: PreparedFylloActionMarkdown,
  context: FylloActionHostContextInput,
  controller: FylloActionRegistrationController
): Promise<void> {
  await Promise.all(
    prepared.candidates.map(async (candidate) => {
      const parseResult = parseFylloActionNode({
        attrs: candidate.attrs,
        content: candidate.body,
        loading: !candidate.closed,
        raw: candidate.raw,
      });
      if (parseResult.status !== "ready") {
        return;
      }

      const actionId = buildChatFylloActionId({
        sessionId: context.sessionId,
        messageIndex: context.messageIndex,
        partIndex: context.partIndex,
        actionOrdinalInPart: candidate.sourceOrdinal,
      });
      if (context.actionStates?.[actionId]) {
        return;
      }

      await controller.register(context.projectId, context.sessionId, actionId, parseResult);
    })
  );
}

/**
 * 为 Markstream 生成 render-only Markdown。原始消息不会被修改，内部标签和占位符
 * 也不会进入 public Action payload 或持久化 identity。
 */
export function prepareFylloActionMarkdown(
  source: string,
  analysis: FylloActionMarkdownAnalysis = analyzeFylloActionMarkdown(source)
): PreparedFylloActionMarkdown {
  return prepareFylloTagMarkdown(source, analysis, fylloActionTransportConfig);
}

export function createFylloActionNodeTransformer(
  prepared: Pick<PreparedFylloActionMarkdown, "placeholders">
): FylloTagPostTransformNodes {
  return createFylloTagNodeTransformer(prepared, fylloActionTransportConfig);
}

function normalizeInternalRaw(raw: string): string {
  return raw
    .split(`<${INTERNAL_FYLLO_ACTION_TAG}`)
    .join(PUBLIC_FYLLO_ACTION_OPEN)
    .split(`</${INTERNAL_FYLLO_ACTION_TAG}>`)
    .join(PUBLIC_FYLLO_ACTION_CLOSE);
}

/**
 * 将 internal rendered node 映射回 shared analysis 的源码 ordinal。
 * 同一 node object 重复解析时使用 WeakMap 保持稳定；重复 payload 首次出现时按 candidate 源码顺序分配。
 */
export function createFylloActionOrdinalResolver(
  analysis: FylloActionMarkdownAnalysis
): (node: FylloActionOrdinalNode) => number | null {
  const candidates = analysis.occurrences.filter(
    (occurrence) => occurrence.disposition === "candidate"
  );
  const claimedSourceOrdinals = new Set<number>();
  const nodeAssignments = new WeakMap<object, number>();

  return (node) => {
    if (node.type !== INTERNAL_FYLLO_ACTION_TAG) {
      return null;
    }
    if (typeof node === "object" && nodeAssignments.has(node)) {
      return nodeAssignments.get(node) ?? null;
    }

    const raw = node.raw ? normalizeInternalRaw(node.raw) : undefined;
    const content = node.content?.trim();
    const matches = candidates.filter(
      (candidate) =>
        Boolean(raw && raw === candidate.raw) ||
        Boolean(content && content === candidate.body.trim())
    );
    const candidate =
      matches.find((item) => !claimedSourceOrdinals.has(item.sourceOrdinal)) ??
      (matches.length === 1 ? matches[0] : undefined) ??
      candidates.find((item) => !claimedSourceOrdinals.has(item.sourceOrdinal));
    if (!candidate) {
      return null;
    }

    claimedSourceOrdinals.add(candidate.sourceOrdinal);
    if (typeof node === "object") {
      nodeAssignments.set(node, candidate.sourceOrdinal);
    }
    return candidate.sourceOrdinal;
  };
}
