import { useOverlay } from "@nuxt/ui/composables";
import ProposalDetailSlideover from "@renderer/components/proposal/ProposalDetailSlideover.vue";
import type { ProposalRef } from "@shared/types/proposal";

export function useProposalDetailSlideover(): {
  openProposalDetail: (proposalRef: ProposalRef) => Promise<void>;
} {
  const overlay = useOverlay();

  async function openProposalDetail(proposalRef: ProposalRef): Promise<void> {
    const slideover = overlay.create(ProposalDetailSlideover, {
      destroyOnClose: true,
    });

    const instance = slideover.open({ proposalRef });
    await instance.result;
  }

  return {
    openProposalDetail,
  };
}
