import type { FylloActionDispatchHandler } from "../types";

export type PlanReviewResult =
  | {
      status: "approved";
    }
  | {
      status: "dismissed";
    };

interface PlanCreateActionHandlerDependencies {
  openPlanReview: (input: {
    sessionId: string;
    slug: string;
    mode: "review";
  }) => Promise<PlanReviewResult>;
}

export function createPlanCreateActionHandler(
  dependencies: PlanCreateActionHandlerDependencies
): FylloActionDispatchHandler<"plan.create"> {
  return async (payload, runtime) => {
    const { sessionId } = runtime.context;

    const result = await dependencies.openPlanReview({
      sessionId,
      slug: payload.slug,
      mode: "review",
    });

    return result.status === "approved" ? { outcome: "succeeded" } : { outcome: "dismissed" };
  };
}
