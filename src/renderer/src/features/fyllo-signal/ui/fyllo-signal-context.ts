import type { ComputedRef, InjectionKey } from "vue";

export interface FylloSignalHostContextInput {
  workspaceId: string;
  parentSessionId: string;
}

export const fylloSignalHostContextKey: InjectionKey<
  ComputedRef<FylloSignalHostContextInput | undefined>
> = Symbol("fyllo-signal-host-context");
