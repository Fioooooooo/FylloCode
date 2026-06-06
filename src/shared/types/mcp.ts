export interface McpServerSpec {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface McpEnvVariable {
  name: string;
  value: string;
}
