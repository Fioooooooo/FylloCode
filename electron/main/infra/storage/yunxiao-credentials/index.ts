import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from "@main/infra/storage/provider-credential-store";

/** 云效集成凭证文件格式（存储于 data/integrations/yunxiao/credentials.json） */
export interface YunxiaoCredentials {
  /** 个人访问令牌 */
  "x-yunxiao-token"?: string;
  /** 当前用户 ID */
  userId?: string;
  /** 当前选中的组织 ID */
  organizationId?: string;
}

function readCredentials(): YunxiaoCredentials {
  return loadCredentials("yunxiao") as YunxiaoCredentials;
}

function writeCredentials(data: YunxiaoCredentials): void {
  if (Object.keys(data).length === 0) {
    clearCredentials("yunxiao");
    return;
  }
  saveCredentials("yunxiao", data as Record<string, string>);
}

/**
 * 读取个人访问令牌，文件不存在或 token 为空时返回空字符串
 */
export function getYunxiaoToken(): string {
  return readCredentials()["x-yunxiao-token"] ?? "";
}

/**
 * 读取已存储的用户 ID，不存在时返回空字符串
 */
export function getYunxiaoUserId(): string {
  return readCredentials().userId ?? "";
}

/**
 * 读取已存储的组织 ID，不存在时返回空字符串
 */
export function getYunxiaoOrganizationId(): string {
  return readCredentials().organizationId ?? "";
}

/**
 * 存储凭证字段，与已有字段合并（不会清除未传入的字段）
 */
export function saveYunxiaoCredentials(patch: Partial<YunxiaoCredentials>): void {
  const current = readCredentials();
  writeCredentials({ ...current, ...patch });
}
