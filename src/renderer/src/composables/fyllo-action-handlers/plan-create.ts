import type { PlanSlideoverResult } from "@renderer/components/chat/plan/PlanSlideover.vue";
import type { FylloActionDispatchHandler } from "./types";
import { requireProjectId, requireSessionId } from "./types";

interface PlanCreateActionHandlerDependencies {
  openPlanReview: (input: {
    sessionId: string;
    slug: string;
    mode: "review";
  }) => Promise<PlanSlideoverResult>;
}

export function createPlanCreateActionHandler(
  dependencies: PlanCreateActionHandlerDependencies
): FylloActionDispatchHandler<"plan.create"> {
  return async (payload, runtime) => {
    const projectId = requireProjectId(runtime.projectId);
    if (typeof projectId !== "string") {
      return projectId;
    }

    const sessionId = requireSessionId(
      runtime.context,
      "当前聊天会话缺少 sessionId，无法审阅规划。"
    );
    if (typeof sessionId !== "string") {
      return sessionId;
    }

    const result = await dependencies.openPlanReview({
      sessionId,
      slug: payload.slug,
      mode: "review",
    });

    return result.status === "approved" ? { outcome: "succeeded" } : { outcome: "dismissed" };
  };
}
