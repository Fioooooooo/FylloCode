import { ref, type Ref } from "vue";
import type { FylloActionParseResult, FylloActionState } from "@shared/fyllo-action/protocol";
import type { Session } from "@shared/types/chat";

export interface RegisterActionPort {
  (input: {
    projectId: string;
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
    projectId: string,
    sessionId: string,
    actionId: string,
    parseResult: FylloActionParseResult
  ): Promise<void>;
  isInFlight(actionId: string): boolean;
  retry(
    projectId: string,
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

  function setInFlight(actionId: string, value: boolean): void {
    if (value) {
      inFlight.add(actionId);
    } else {
      inFlight.delete(actionId);
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
    projectId: string,
    sessionId: string,
    actionId: string,
    parseResult: FylloActionParseResult
  ): Promise<void> {
    if (parseResult.status !== "ready") {
      return;
    }

    if (inFlight.has(actionId) || attempted.has(actionId)) {
      return;
    }

    attempted.add(actionId);
    setInFlight(actionId, true);
    setRegistrationError(actionId, null);

    try {
      const state = await registerAction({
        projectId,
        sessionId,
        actionId,
        type: parseResult.type,
      });
      await persistActionState(sessionId, actionId, state);
      registered.add(actionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRegistrationError(actionId, message);
    } finally {
      setInFlight(actionId, false);
    }
  }

  function isInFlight(actionId: string): boolean {
    return inFlight.has(actionId);
  }

  async function retry(
    projectId: string,
    sessionId: string,
    actionId: string,
    type: "task.create" | "plan.create" | "knowledge.flag" | "knowledge.review"
  ): Promise<void> {
    if (inFlight.has(actionId) || registered.has(actionId)) {
      return;
    }

    setInFlight(actionId, true);
    setRegistrationError(actionId, null);

    try {
      const state = await registerAction({
        projectId,
        sessionId,
        actionId,
        type,
      });
      await persistActionState(sessionId, actionId, state);
      registered.add(actionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRegistrationError(actionId, message);
    } finally {
      setInFlight(actionId, false);
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
