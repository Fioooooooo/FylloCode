import { YunxiaoClient } from "../client";
import { getYunxiaoToken } from "@main/infra/storage/yunxiao-credentials";
import type { CreateChangeRequestParams, ChangeRequest } from "./types";

export type { MrUser, MrReviewer, ChangeRequest, CreateChangeRequestParams } from "./types";

const client = new YunxiaoClient();

export interface YunxiaoRepository {
  Id: number;
  name: string;
  path: string;
  pathWithNamespace?: string;
  description?: string;
  webUrl?: string;
}

interface ListRepositoriesResponse {
  result?: YunxiaoRepository[];
}

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

export async function listRepositories(params: {
  organizationId: string;
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<YunxiaoRepository[]> {
  const token = getYunxiaoToken();
  const response = await client.get<ListRepositoriesResponse>("/repository/list", token, {
    organizationId: params.organizationId,
    accessToken: token,
    search: params.search,
    page: params.page,
    perPage: params.perPage,
  });
  return response.result ?? [];
}
