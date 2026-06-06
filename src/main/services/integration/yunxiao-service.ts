import {
  saveYunxiaoCredentials,
  getYunxiaoToken,
  listOrganizations,
} from "@main/domain/integration/yunxiao";
import { connectProvider, disconnectProvider } from "@main/services/integration/provider-service";
import type { YunxiaoOrganization } from "@shared/types/integration";

const TOOL_ID = "yunxiao";

/**
 * 设置云效 Token。
 * 存储 token 后立即拉取组织列表验证有效性，成功后写入连接状态。
 */
export async function setYunxiaoToken(token: string): Promise<YunxiaoOrganization[]> {
  const connection = await connectProvider(TOOL_ID, { "x-yunxiao-token": token });
  const orgs = await listOrganizations();
  if (connection.accountId) {
    saveYunxiaoCredentials({ userId: connection.accountId });
  }
  return orgs.map(({ id, name, description }) => ({ id, name, description }));
}

/**
 * 保存当前选中的组织 ID
 */
export function setYunxiaoOrganization(organizationId: string): void {
  saveYunxiaoCredentials({ organizationId });
}

/**
 * 读取云效连接的凭证回显（从 credentials.json 读取并脱敏）
 * 用于页面回显，不返回原始 token
 */
export function getYunxiaoCredentialPreview(): Record<string, string> {
  const token = getYunxiaoToken();
  if (!token) return {};
  return { "x-yunxiao-token": maskToken(token) };
}

/**
 * 断开云效连接，清除 token 和连接状态
 */
export function disconnectYunxiao(): void {
  saveYunxiaoCredentials({
    "x-yunxiao-token": undefined,
    userId: undefined,
    organizationId: undefined,
  });
  disconnectProvider(TOOL_ID);
}

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}
