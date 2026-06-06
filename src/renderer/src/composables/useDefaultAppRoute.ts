import { computed, type ComputedRef } from "vue";
import { useRouter } from "vue-router";
import { defaultActivityBarItem } from "@renderer/config/activity-bar";

export interface UseDefaultAppRouteReturn {
  defaultPath: ComputedRef<string>;
  goToDefault: () => Promise<void>;
}

export function useDefaultAppRoute(): UseDefaultAppRouteReturn {
  const router = useRouter();

  const defaultPath = computed(() => defaultActivityBarItem.path);

  async function goToDefault(): Promise<void> {
    await router.push(defaultPath.value);
  }

  return {
    defaultPath,
    goToDefault,
  };
}
