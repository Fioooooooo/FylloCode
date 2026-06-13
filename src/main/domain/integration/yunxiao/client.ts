/**
 * 云效 (Yunxiao) OpenAPI Client
 *
 * 基于原生 fetch 封装，用于与阿里云云效服务通信。
 * 文档: https://help.aliyun.com/document_detail/153256.html
 */

import logger from "@main/infra/logger";

export const YUNXIAO_DOMAIN = "openapi-rdc.aliyuncs.com";

/** Query 参数中可能携带凭证的字段，写日志前需脱敏，避免 token 落盘。 */
const SENSITIVE_QUERY_KEYS = new Set(["accessToken", "access_token", "token"]);

/** 将 URL 中的敏感 query 值替换为 ***，仅用于日志输出，不影响实际请求。 */
function redactUrlForLog(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key)) {
        url.searchParams.set(key, "***");
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface YunxiaoRequestOptions {
  method?: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  token: string;
}

export class YunxiaoApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "YunxiaoApiError";
  }
}

export class YunxiaoClient {
  readonly domain: string;

  constructor(domain: string = YUNXIAO_DOMAIN) {
    this.domain = domain;
  }

  /**
   * 构建完整请求 URL
   */
  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`https://${this.domain}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * 发送请求并处理响应
   */
  async request<T = unknown>(options: YunxiaoRequestOptions): Promise<T> {
    const { method = "GET", path, query, body, token } = options;

    const url = this.buildUrl(path, query);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-yunxiao-token": token,
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    logger.debug(`[YunxiaoClient] ${method} ${redactUrlForLog(url)}`);

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // 处理 HTTP 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      throw this.buildError(response.status, data);
    }

    return data as T;
  }

  /**
   * 根据 HTTP 状态码和响应体构建错误
   */
  private buildError(status: number, data: Record<string, unknown>): YunxiaoApiError {
    const code = String(data["errorCode"] ?? data["code"] ?? "UnknownError");
    const message = String(data["errorMessage"] ?? data["message"] ?? "未知错误");

    switch (status) {
      case 400:
        if (code === "UnsupportedInCurrentEnv") {
          return new YunxiaoApiError(status, code, "当前实例版本暂未支持该 API");
        }
        if (code === "UnsupportedCurrentTokenType") {
          return new YunxiaoApiError(
            status,
            code,
            "API 暂不支持使用当前令牌类型，请查阅 API 文档确认鉴权方式"
          );
        }
        return new YunxiaoApiError(status, code, message || "错误请求");

      case 401:
        if (code === "ExpiredTokenError") {
          return new YunxiaoApiError(status, code, "令牌已过期");
        }
        if (code === "InvalidTokenError") {
          return new YunxiaoApiError(status, code, "令牌无效");
        }
        return new YunxiaoApiError(status, code, message || "未授权");

      case 403:
        if (code === "Forbidden.InvalidUser.UserNotInCurrentOrganization") {
          return new YunxiaoApiError(status, code, "当前用户未加入组织，没有操作权限");
        }
        if (code === "Forbidden.InvalidOrganizationMember") {
          return new YunxiaoApiError(status, code, "当前用户在组织中无效，没有操作权限");
        }
        return new YunxiaoApiError(status, code, message || "无权限");

      case 429:
        return new YunxiaoApiError(status, code, message || "发送了过多请求");

      case 500:
        return new YunxiaoApiError(status, code, message || "发生了内部错误");

      default:
        return new YunxiaoApiError(status, code, message || `HTTP ${status}`);
    }
  }

  /**
   * GET 快捷方法
   */
  get<T = unknown>(
    path: string,
    token: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: "GET", path, query, token });
  }

  /**
   * POST 快捷方法
   */
  post<T = unknown>(
    path: string,
    token: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: "POST", path, body, query, token });
  }

  /**
   * PUT 快捷方法
   */
  put<T = unknown>(
    path: string,
    token: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: "PUT", path, body, query, token });
  }

  /**
   * DELETE 快捷方法
   */
  delete<T = unknown>(
    path: string,
    token: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>({ method: "DELETE", path, query, token });
  }
}
