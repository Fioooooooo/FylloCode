import {
  saveYunxiaoCredentials,
  getYunxiaoToken,
  listOrganizations,
} from "@main/domain/integration/yunxiao";
import { saveConnection, removeConnection } from "@main/infra/storage/connections-store";
import type { YunxiaoOrganization } from "@shared/types/integration";

const TOOL_ID = "yunxiao";

/**
 * 设置云效 Token。
 * 存储 token 后立即拉取组织列表验证有效性，成功后写入连接状态。
 */
export async function setYunxiaoToken(token: string): Promise<YunxiaoOrganization[]> {
  saveYunxiaoCredentials({ "x-yunxiao-token": token });

  const orgs = await listOrganizations();

  saveConnection({
    toolId: TOOL_ID,
    status: "connected",
    connectedAt: new Date().toISOString(),
    credentialPreview: {
      "x-yunxiao-token": maskToken(token),
    },
  });

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
  saveYunxiaoCredentials({ "x-yunxiao-token": undefined, organizationId: undefined });
  removeConnection(TOOL_ID);
}

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}
