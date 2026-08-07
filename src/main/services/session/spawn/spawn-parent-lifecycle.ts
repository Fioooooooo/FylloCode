type ParentDeletionHandler = (workspaceId: string, parentSessionId: string) => Promise<void>;

let parentDeletionHandler: ParentDeletionHandler | null = null;

export function registerSpawnParentDeletionHandler(handler: ParentDeletionHandler): () => void {
  if (parentDeletionHandler) {
    throw new Error("Spawn parent deletion handler is already registered");
  }
  parentDeletionHandler = handler;
  return () => {
    if (parentDeletionHandler === handler) parentDeletionHandler = null;
  };
}

export async function deleteSpawnedSessionsForParent(
  workspaceId: string,
  parentSessionId: string
): Promise<void> {
  await parentDeletionHandler?.(workspaceId, parentSessionId);
}
