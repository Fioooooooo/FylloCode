import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getDataSubPath } from "@main/infra/paths";

/** 云效集成凭证文件格式（存储于 data/integrations/yunxiao/credentials.json） */
export interface YunxiaoCredentials {
  /** 个人访问令牌 */
  "x-yunxiao-token"?: string;
  /** 当前用户 ID */
  userId?: string;
  /** 当前选中的组织 ID */
  organizationId?: string;
}

const CREDENTIALS_FILE = "credentials.json";

function getCredentialsPath(): string {
  return join(getDataSubPath("integrations"), "yunxiao", CREDENTIALS_FILE);
}

function readCredentials(): YunxiaoCredentials {
  try {
    const content = readFileSync(getCredentialsPath(), "utf-8");
    return JSON.parse(content) as YunxiaoCredentials;
  } catch {
    return {};
  }
}

function writeCredentials(data: YunxiaoCredentials): void {
  const filePath = getCredentialsPath();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
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
