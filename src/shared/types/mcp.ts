export interface McpServerSpecStdio {
  type: "stdio";
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface McpServerSpecHttp {
  type: "http";
  name: string;
  url: string;
  headers: Record<string, string>;
}

export type McpServerSpec = McpServerSpecStdio | McpServerSpecHttp;

export interface McpEnvVariable {
  name: string;
  value: string;
}
