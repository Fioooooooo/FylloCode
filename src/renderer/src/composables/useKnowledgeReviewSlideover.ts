import { useOverlay } from "@nuxt/ui/composables";
import KnowledgeReviewSlideover, {
  type KnowledgeReviewSlideoverResult,
} from "@renderer/components/chat/knowledge/KnowledgeReviewSlideover.vue";

export function useKnowledgeReviewSlideover(): {
  openKnowledgeReview: (input: {
    workspaceId: string;
    sessionId: string;
    name: string;
  }) => Promise<KnowledgeReviewSlideoverResult>;
} {
  const overlay = useOverlay();

  async function openKnowledgeReview(input: {
    workspaceId: string;
    sessionId: string;
    name: string;
  }): Promise<KnowledgeReviewSlideoverResult> {
    const slideover = overlay.create(KnowledgeReviewSlideover, {
      destroyOnClose: true,
    });

    const instance = slideover.open({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      name: input.name,
    });
    return (await instance.result) ?? { status: "dismissed" };
  }

  return {
    openKnowledgeReview,
  };
}
