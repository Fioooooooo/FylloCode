import { YunxiaoClient } from "../client";
import { getYunxiaoToken } from "@main/infra/storage/yunxiao-credentials";

export interface YunxiaoPipeline {
  pipelineId: number;
  pipelineName: string;
  createTime?: number;
  createAccountId?: string;
}

const client = new YunxiaoClient();

export async function listPipelines(
  query: {
    pipelineName?: string;
    page?: number;
    perPage?: number;
  } = {}
): Promise<YunxiaoPipeline[]> {
  const token = getYunxiaoToken();
  return client.get<YunxiaoPipeline[]>("/oapi/v1/flow/organizations/pipelines", token, query);
}
