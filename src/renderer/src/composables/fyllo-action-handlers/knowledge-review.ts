import type { KnowledgeReviewActionPayload } from "@shared/types/fyllo-action";
import type { FylloActionDispatchHandler } from "./types";
import { requireProjectId, requireSessionId } from "./types";

export type KnowledgeReviewSlideoverResult =
  | {
      status: "approved";
    }
  | {
      status: "dismissed";
    };

export interface KnowledgeReviewActionHandlerDependencies {
  openKnowledgeReview: (input: {
    sessionId: string;
    name: string;
  }) => Promise<KnowledgeReviewSlideoverResult>;
}

export function createKnowledgeReviewActionHandler(
  dependencies: KnowledgeReviewActionHandlerDependencies
): FylloActionDispatchHandler<"knowledge.review"> {
  return async (payload: KnowledgeReviewActionPayload, runtime) => {
    const projectId = requireProjectId(runtime.projectId);
    if (typeof projectId !== "string") {
      return projectId;
    }

    const sessionId = requireSessionId(
      runtime.context,
      "当前聊天会话缺少 sessionId，无法审阅知识。"
    );
    if (typeof sessionId !== "string") {
      return sessionId;
    }

    const result = await dependencies.openKnowledgeReview({
      sessionId,
      name: payload.name,
    });

    return result.status === "approved" ? { outcome: "succeeded" } : { outcome: "dismissed" };
  };
}
