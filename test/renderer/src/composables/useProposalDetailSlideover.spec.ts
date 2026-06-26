import { describe, expect, it, vi } from "vitest";
import { useOverlay } from "@nuxt/ui/composables";
import ProposalDetailSlideover from "@renderer/components/proposal/ProposalDetailSlideover.vue";
import { useProposalDetailSlideover } from "@renderer/composables/useProposalDetailSlideover";

describe("useProposalDetailSlideover", () => {
  it("opens proposal detail and only awaits overlay result", async () => {
    const overlay = useOverlay() as unknown as {
      create: ReturnType<typeof vi.fn>;
    };
    overlay.create.mockClear();

    const { openProposalDetail } = useProposalDetailSlideover();

    await expect(openProposalDetail("change-1")).resolves.toBeUndefined();

    expect(overlay.create).toHaveBeenCalledWith(ProposalDetailSlideover, {
      destroyOnClose: true,
    });
    expect(overlay.create.mock.results[0].value.open).toHaveBeenCalledWith({
      changeId: "change-1",
    });
  });
});
