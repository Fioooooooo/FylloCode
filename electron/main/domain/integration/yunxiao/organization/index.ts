import { YunxiaoClient } from "../client";
import { getYunxiaoToken } from "@main/infra/storage/yunxiao-credentials";
import type { ListOrganizationsOptions, Organization, YunxiaoUser } from "./types";

export type { Organization, ListOrganizationsOptions, YunxiaoUser } from "./types";

const client = new YunxiaoClient();

/**
 * 查询当前令牌用户加入的组织列表
 */
export async function listOrganizations(
  options: ListOrganizationsOptions = {}
): Promise<Organization[]> {
  const token = getYunxiaoToken();
  return client.get<Organization[]>("/oapi/v1/platform/organizations", token, {
    userId: options.userId,
  });
}

/**
 * 查询当前个人访问令牌对应的用户信息
 */
export async function getUser(): Promise<YunxiaoUser> {
  const token = getYunxiaoToken();
  return client.get<YunxiaoUser>("/oapi/v1/platform/user", token);
}
