import { computed, toRef } from "vue";
import type { MaybeRefOrGetter } from "vue";
import type { Session } from "@shared/types/chat";
import { getSessionAttention } from "../model/session-attention";

const MAX_DISPLAY_COUNT = 99;

export interface UseSessionAttentionReturn {
  attentionCount: import("vue").ComputedRef<number>;
  displayCount: import("vue").ComputedRef<string>;
  hasAttention: import("vue").ComputedRef<boolean>;
}

export function useSessionAttention(
  session: MaybeRefOrGetter<Session | null | undefined>
): UseSessionAttentionReturn {
  const sessionRef = toRef(session);

  const attentionCount = computed(() => getSessionAttention(sessionRef.value));
  const hasAttention = computed(() => attentionCount.value > 0);
  const displayCount = computed(() =>
    attentionCount.value > MAX_DISPLAY_COUNT
      ? `${MAX_DISPLAY_COUNT}+`
      : String(attentionCount.value)
  );

  return {
    attentionCount,
    displayCount,
    hasAttention,
  };
}
