export type AcpSessionConfigOptionValue = string;

export interface AcpSessionConfigOptionValueItem {
  value: AcpSessionConfigOptionValue;
  name: string;
  description?: string;
}

export interface AcpSessionConfigOptionGroup {
  group: string;
  name: string;
  options: AcpSessionConfigOptionValueItem[];
}

export type AcpSessionConfigOptionCategory = "mode" | "model" | "thought_level" | string;

interface AcpSessionConfigOptionBase {
  id: string;
  name: string;
  description?: string;
  category?: AcpSessionConfigOptionCategory;
}

export interface AcpSessionConfigSelect extends AcpSessionConfigOptionBase {
  type: "select";
  currentValue: AcpSessionConfigOptionValue;
  options: AcpSessionConfigOptionValueItem[] | AcpSessionConfigOptionGroup[];
}

export interface AcpSessionConfigBoolean extends AcpSessionConfigOptionBase {
  type: "boolean";
  currentValue: boolean;
}

export type AcpSessionConfigOption = AcpSessionConfigSelect | AcpSessionConfigBoolean;
