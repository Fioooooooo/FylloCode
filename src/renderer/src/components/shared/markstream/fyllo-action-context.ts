import type { InjectionKey } from "vue";
import type { FylloActionState } from "@shared/types/fyllo-action";

export interface FylloActionOrdinalNode {
  raw?: string;
  content?: string;
}

export interface FylloActionContextInput {
  sessionId: string;
  messageIndex: number;
  partIndex: number;
  actionStates?: Record<string, FylloActionState>;
  persistActionState?: (actionId: string, state: FylloActionState) => Promise<void>;
}

export interface FylloActionHostContext {
  sessionId: string;
  messageIndex: number;
  partIndex: number;
  resolveActionOrdinal: (node: FylloActionOrdinalNode) => number;
  getActionState: (actionId: string) => FylloActionState | undefined;
  persistActionState?: (actionId: string, state: FylloActionState) => Promise<void>;
}

export const fylloActionHostContextKey: InjectionKey<FylloActionHostContext> = Symbol(
  "fyllo-action-host-context"
);

interface FylloActionSource {
  raw: string;
  content: string;
}

// Matches `<fyllo-action>` tags to extract their raw text and body content.
// Unlike the parser in @shared/utils/fyllo-action.ts, this regex does not capture
// attributes because the renderer only needs to map rendered nodes back to ordinal positions.
const fylloActionTagPattern = /<fyllo-action\b[^>]*>([\s\S]*?)(?:<\/fyllo-action>|$)/g;

function collectActionSources(source: string): FylloActionSource[] {
  return Array.from(source.matchAll(fylloActionTagPattern), (match) => ({
    raw: match[0],
    content: match[1] ?? "",
  }));
}

/**
 * Create a resolver that maps a rendered Fyllo action node back to its ordinal position
 * within the original assistant message source.
 *
 * The resolver is needed because MarkStream renders nodes incrementally: a node may first
 * appear as a partial/raw string and later stabilize with its final content. We match by
 * raw text first, then by trimmed content, and finally fall back to the next unused ordinal.
 */
export function createFylloActionOrdinalResolver(
  source: string
): (node: FylloActionOrdinalNode) => number {
  const sources = collectActionSources(source);
  const claimed = new Set<number>();
  let fallbackOrdinal = 0;

  return (node) => {
    const raw = node.raw;
    const content = node.content?.trim();
    const matchedIndex = sources.findIndex((sourceItem, index) => {
      if (claimed.has(index)) {
        return false;
      }

      // Prefer matching by raw rendered text; tolerate partial matches during streaming.
      if (raw && (raw === sourceItem.raw || sourceItem.raw.includes(raw))) {
        return true;
      }

      return Boolean(content && sourceItem.content.trim() === content);
    });

    if (matchedIndex >= 0) {
      claimed.add(matchedIndex);
      return matchedIndex;
    }

    // No source match: allocate the smallest unused ordinal so that late-rendered nodes
    // still get a stable identity for action state.
    while (claimed.has(fallbackOrdinal)) {
      fallbackOrdinal += 1;
    }

    const ordinal = fallbackOrdinal;
    claimed.add(ordinal);
    fallbackOrdinal += 1;
    return ordinal;
  };
}
