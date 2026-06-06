import { YunxiaoClient } from "../client";
import { getYunxiaoToken } from "@main/infra/storage/yunxiao-credentials";
import type {
  SearchWorkitemsParams,
  GetWorkitemParams,
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
  GetWorkitemParams,
  CreateWorkitemParams,
  CreateWorkitemResult,
  UpdateWorkitemParams,
} from "./types";

const client = new YunxiaoClient();

export interface YunxiaoProject {
  id: string;
  name: string;
  description?: string;
  customCode?: string;
  logicalStatus?: string;
}

function buildProjectNameCondition(search?: string): string | undefined {
  const keyword = search?.trim();
  if (!keyword) return undefined;
  return JSON.stringify({
    conditionGroups: [
      [
        {
          className: "string",
          fieldIdentifier: "name",
          format: "input",
          operator: "BETWEEN",
          toValue: null,
          value: [keyword],
        },
      ],
    ],
  });
}

export async function searchProjects(params: {
  organizationId: string;
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<YunxiaoProject[]> {
  const token = getYunxiaoToken();
  return client.post<YunxiaoProject[]>(
    `/oapi/v1/projex/organizations/${params.organizationId}/projects:search`,
    token,
    {
      conditions: buildProjectNameCondition(params.search),
      extraConditions: "",
      orderBy: "gmtCreate",
      page: params.page ?? 1,
      perPage: params.perPage ?? 20,
      sort: "desc",
    }
  );
}

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
 * 获取单条工作项详情
 */
export async function getWorkitem(params: GetWorkitemParams): Promise<Workitem> {
  const { organizationId, id } = params;
  const token = getYunxiaoToken();
  return client.get<Workitem>(
    `/oapi/v1/projex/organizations/${organizationId}/workitems/${id}`,
    token
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
