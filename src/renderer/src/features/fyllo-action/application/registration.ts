import { ref, type Ref } from "vue";
import type { FylloActionParseResult, FylloActionState } from "@shared/fyllo-action/protocol";
import type { Session } from "@shared/types/chat";

export interface RegisterActionPort {
  (input: {
    workspaceId: string;
    sessionId: string;
    actionId: string;
    type: "task.create" | "plan.create" | "knowledge.flag" | "knowledge.review";
  }): Promise<FylloActionState>;
}

export interface PersistActionStatePort {
  (sessionId: string, actionId: string, state: FylloActionState): Promise<void>;
}

export interface FylloActionRegistrationController {
  register(
    workspaceId: string,
    sessionId: string,
    actionId: string,
    parseResult: FylloActionParseResult
  ): Promise<void>;
  isInFlight(actionId: string): boolean;
  retry(
    workspaceId: string,
    sessionId: string,
    actionId: string,
    type: "task.create" | "plan.create" | "knowledge.flag" | "knowledge.review"
  ): Promise<void>;
  registrationErrors: Ref<ReadonlyMap<string, string>>;
}

export function createFylloActionRegistrationController(
  registerAction: RegisterActionPort,
  persistActionState: PersistActionStatePort
): FylloActionRegistrationController {
  const inFlight = new Set<string>();
  const attempted = new Set<string>();
  const registered = new Set<string>();
  const registrationErrors = ref<Map<string, string>>(new Map());

  function registrationKey(workspaceId: string, sessionId: string, actionId: string): string {
    return `${workspaceId}\u0000${sessionId}\u0000${actionId}`;
  }

  function setInFlight(key: string, value: boolean): void {
    if (value) {
      inFlight.add(key);
    } else {
      inFlight.delete(key);
    }
  }

  function setRegistrationError(actionId: string, error: string | null): void {
    const next = new Map(registrationErrors.value);
    if (error === null) {
      next.delete(actionId);
    } else {
      next.set(actionId, error);
    }
    registrationErrors.value = next;
  }

  async function register(
    workspaceId: string,
    sessionId: string,
    actionId: string,
    parseResult: FylloActionParseResult
  ): Promise<void> {
    if (parseResult.status !== "ready") {
      return;
    }

    const key = registrationKey(workspaceId, sessionId, actionId);
    if (inFlight.has(key) || attempted.has(key)) {
      return;
    }

    attempted.add(key);
    setInFlight(key, true);
    setRegistrationError(actionId, null);

    try {
      const state = await registerAction({
        workspaceId,
        sessionId,
        actionId,
        type: parseResult.type,
      });
      await persistActionState(sessionId, actionId, state);
      registered.add(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRegistrationError(actionId, message);
    } finally {
      setInFlight(key, false);
    }
  }

  function isInFlight(actionId: string): boolean {
    return [...inFlight].some((key) => key.endsWith(`\u0000${actionId}`));
  }

  async function retry(
    workspaceId: string,
    sessionId: string,
    actionId: string,
    type: "task.create" | "plan.create" | "knowledge.flag" | "knowledge.review"
  ): Promise<void> {
    const key = registrationKey(workspaceId, sessionId, actionId);
    if (inFlight.has(key) || registered.has(key)) {
      return;
    }

    setInFlight(key, true);
    setRegistrationError(actionId, null);

    try {
      const state = await registerAction({
        workspaceId,
        sessionId,
        actionId,
        type,
      });
      await persistActionState(sessionId, actionId, state);
      registered.add(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRegistrationError(actionId, message);
    } finally {
      setInFlight(key, false);
    }
  }

  return {
    register,
    isInFlight,
    retry,
    registrationErrors,
  };
}

export function getActionState(
  session: Session | null | undefined,
  actionId: string
): FylloActionState | undefined {
  return session?.actionStates?.[actionId];
}
