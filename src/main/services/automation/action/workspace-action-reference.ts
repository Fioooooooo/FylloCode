import { listSessionMetas } from "@main/infra/storage/session-store";

export async function hasPendingWorkspaceActions(
  workspaceId: string,
  folderId: string
): Promise<boolean> {
  const metas = await listSessionMetas(workspaceId);
  return metas.some(
    (meta) =>
      meta.workspaceSnapshot?.folders.some((folder) => folder.folderId === folderId) === true &&
      Object.values(meta.actionStates ?? {}).some((state) => state.status === "ready")
  );
}
