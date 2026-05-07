import { YunxiaoClient } from "../client";
import { getYunxiaoToken } from "@main/infra/storage/yunxiao-credentials";
import type {
  SearchWorkitemsParams,
  CreateWorkitemParams,
  CreateWorkitemResult,
  UpdateWorkitemParams,
  Workitem,
} from "./types";

export type {
  WorkitemUser,
  WorkitemLabel,
  WorkitemStatus,
  WorkitemRef,
  CustomFieldValue,
  Workitem,
  SearchWorkitemsParams,
  CreateWorkitemParams,
  CreateWorkitemResult,
  UpdateWorkitemParams,
} from "./types";

const client = new YunxiaoClient();

/**
 * 搜索工作项
 */
export async function searchWorkitems(params: SearchWorkitemsParams): Promise<Workitem[]> {
  const { organizationId, ...body } = params;
  const token = getYunxiaoToken();
  return client.post<Workitem[]>(
    `/oapi/v1/projex/organizations/${organizationId}/workitems:search`,
    token,
    body as Record<string, unknown>
  );
}

/**
 * 创建工作项
 */
export async function createWorkitem(params: CreateWorkitemParams): Promise<CreateWorkitemResult> {
  const { organizationId, ...body } = params;
  const token = getYunxiaoToken();
  return client.post<CreateWorkitemResult>(
    `/oapi/v1/projex/organizations/${organizationId}/workitems`,
    token,
    body as Record<string, unknown>
  );
}

/**
 * 更新工作项字段
 * fields 格式：{"fieldId": "value"} 或多值 {"fieldId": ["value1", "value2"]}
 */
export async function updateWorkitem(params: UpdateWorkitemParams): Promise<void> {
  const { organizationId, id, fields } = params;
  const token = getYunxiaoToken();
  await client.put<void>(
    `/oapi/v1/projex/organizations/${organizationId}/workitems/${id}`,
    token,
    fields
  );
}
