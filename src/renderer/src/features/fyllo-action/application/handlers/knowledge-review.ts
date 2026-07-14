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
    sessionId: string;
    name: string;
  }) => Promise<KnowledgeReviewResult>;
}

export function createKnowledgeReviewActionHandler(
  dependencies: KnowledgeReviewActionHandlerDependencies
): FylloActionDispatchHandler<"knowledge.review"> {
  return async (payload, runtime) => {
    const { sessionId } = runtime.context;

    const result = await dependencies.openKnowledgeReview({
      sessionId,
      name: payload.name,
    });

    return result.status === "approved" ? { outcome: "succeeded" } : { outcome: "dismissed" };
  };
}
