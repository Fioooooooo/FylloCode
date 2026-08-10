import {
  findFirstMessageSearchSnippet,
  matchesSessionSearchQuery,
  normalizeSessionSearchQuery,
} from "@main/domain/session/chat/session-search";
import {
  listSessionMetas,
  loadMessages,
  type SessionMeta,
} from "@main/infra/storage/session-store";
import type { SessionSearchResult } from "@shared/types/chat";

const MAX_SESSION_SEARCH_RESULTS = 50;

function byUpdatedAtDescending(left: SessionMeta, right: SessionMeta): number {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function toResult(
  meta: SessionMeta,
  matchKind: SessionSearchResult["matchKind"],
  snippet?: string
): SessionSearchResult {
  return {
    sessionId: meta.sessionId,
    title: meta.title,
    updatedAt: new Date(meta.updatedAt),
    matchKind,
    ...(snippet ? { snippet } : {}),
  };
}

export async function searchSessions(
  workspaceId: string,
  query: string
): Promise<SessionSearchResult[]> {
  const normalizedQuery = normalizeSessionSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const titleMatches: SessionSearchResult[] = [];
  const sessionIdMatches: SessionSearchResult[] = [];
  const messageCandidates: SessionMeta[] = [];
  const metas = (await listSessionMetas(workspaceId)).sort(byUpdatedAtDescending);

  for (const meta of metas) {
    if (matchesSessionSearchQuery(meta.title, normalizedQuery)) {
      titleMatches.push(toResult(meta, "title"));
    } else if (matchesSessionSearchQuery(meta.sessionId, normalizedQuery)) {
      sessionIdMatches.push(toResult(meta, "session-id"));
    } else {
      messageCandidates.push(meta);
    }
  }

  const metadataMatches = [...titleMatches, ...sessionIdMatches];
  if (metadataMatches.length >= MAX_SESSION_SEARCH_RESULTS) {
    return metadataMatches.slice(0, MAX_SESSION_SEARCH_RESULTS);
  }

  const messageMatches: SessionSearchResult[] = [];
  const remaining = MAX_SESSION_SEARCH_RESULTS - metadataMatches.length;
  for (const meta of messageCandidates) {
    try {
      const messages = await loadMessages(workspaceId, meta.sessionId);
      const snippet = findFirstMessageSearchSnippet(messages, normalizedQuery);
      if (snippet) {
        messageMatches.push(toResult(meta, "message", snippet));
        if (messageMatches.length >= remaining) {
          break;
        }
      }
    } catch {
      // A single unreadable Session must not make the entire Workspace search fail.
    }
  }

  return [...metadataMatches, ...messageMatches];
}
