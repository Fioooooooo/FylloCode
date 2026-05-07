import { YunxiaoClient } from "../client";
import { getYunxiaoToken } from "@main/infra/storage/yunxiao-credentials";
import type { CreateChangeRequestParams, ChangeRequest } from "./types";

export type { MrUser, MrReviewer, ChangeRequest, CreateChangeRequestParams } from "./types";

const client = new YunxiaoClient();

/**
 * 创建合并请求（MR）
 */
export async function createChangeRequest(
  params: CreateChangeRequestParams
): Promise<ChangeRequest> {
  const { organizationId, repositoryId, ...body } = params;
  const token = getYunxiaoToken();
  return client.post<ChangeRequest>(
    `/oapi/v1/codeup/organizations/${organizationId}/repositories/${repositoryId}/changeRequests`,
    token,
    body as Record<string, unknown>
  );
}
