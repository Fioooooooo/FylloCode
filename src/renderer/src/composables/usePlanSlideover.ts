import { useOverlay } from "@nuxt/ui/composables";
import PlanSlideover, {
  type PlanSlideoverMode,
  type PlanSlideoverResult,
} from "@renderer/components/chat/plan/PlanSlideover.vue";

export function usePlanSlideover(): {
  openPlanReview: (input: {
    workspaceId: string;
    sessionId: string;
    slug: string;
    mode?: PlanSlideoverMode;
  }) => Promise<PlanSlideoverResult>;
} {
  const overlay = useOverlay();

  async function openPlanReview(input: {
    workspaceId: string;
    sessionId: string;
    slug: string;
    mode?: PlanSlideoverMode;
  }): Promise<PlanSlideoverResult> {
    const slideover = overlay.create(PlanSlideover, {
      destroyOnClose: true,
    });

    const instance = slideover.open({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      slug: input.slug,
      mode: input.mode ?? "review",
    });
    return (await instance.result) ?? { status: "dismissed" };
  }

  return {
    openPlanReview,
  };
}
