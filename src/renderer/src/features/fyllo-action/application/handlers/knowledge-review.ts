import type { FylloActionDispatchHandler } from "../types";

export type KnowledgeReviewResult =
  | {
      status: "approved";
    }
  | {
      status: "dismissed";
    };

interface KnowledgeReviewActionHandlerDependencies {
  openKnowledgeReview: (input: {
    workspaceId: string;
    sessionId: string;
    name: string;
  }) => Promise<KnowledgeReviewResult>;
}

export function createKnowledgeReviewActionHandler(
  dependencies: KnowledgeReviewActionHandlerDependencies
): FylloActionDispatchHandler<"knowledge.review"> {
  return async (payload, runtime) => {
    const { workspaceId, sessionId } = runtime.context;

    const result = await dependencies.openKnowledgeReview({
      workspaceId,
      sessionId,
      name: payload.name,
    });

    return result.status === "approved" ? { outcome: "succeeded" } : { outcome: "dismissed" };
  };
}
