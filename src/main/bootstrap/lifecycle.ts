import logger from "@main/infra/logger";

export interface Disposable {
  name: string;
  dispose(): Promise<void> | void;
}

const registry: Disposable[] = [];
let disposing = false;

/** Register a long-lived resource to be released on `disposeAll()`. */
export function registerDisposable(disposable: Disposable): void {
  registry.push(disposable);
}

/**
 * Dispose every registered resource in reverse registration order.
 *
 * Each `dispose()` call is awaited with an 8-second timeout so a hung
 * resource cannot block shutdown. The 8s budget covers the ACP process
 * pool's three-phase teardown (graceful close → SIGTERM grace → SIGKILL
 * fallback) with headroom. Exceptions are logged but do not stop the
 * iteration.
 */
export async function disposeAll(timeoutMs = 8_000): Promise<void> {
  if (disposing) return;
  disposing = true;

  const items = registry.splice(0).reverse();
  for (const item of items) {
    try {
      await Promise.race([
        Promise.resolve().then(() => item.dispose()),
        new Promise<void>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error(`[lifecycle] dispose("${item.name}") timed out`)),
            timeoutMs
          )
        ),
      ]);
    } catch (err) {
      logger.warn(`[lifecycle] dispose("${item.name}") failed`, err);
    }
  }
}

/** Test-only: clear internal state. */
export function resetLifecycleForTests(): void {
  registry.length = 0;
  disposing = false;
}
