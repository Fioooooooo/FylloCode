import { useOverlay } from "@nuxt/ui/composables";
import ProposalDetailSlideover from "@renderer/components/proposal/ProposalDetailSlideover.vue";

export function useProposalDetailSlideover(): {
  openProposalDetail: (changeId: string) => Promise<void>;
} {
  const overlay = useOverlay();

  async function openProposalDetail(changeId: string): Promise<void> {
    const slideover = overlay.create(ProposalDetailSlideover, {
      destroyOnClose: true,
    });

    const instance = slideover.open({ changeId });
    await instance.result;
  }

  return {
    openProposalDetail,
  };
}
