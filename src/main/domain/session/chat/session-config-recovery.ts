import type {
  AcpSessionConfigOption,
  AcpSessionConfigOptionGroup,
  AcpSessionConfigOptionValueItem,
} from "@shared/types/acp-config";

export type SessionConfigIncompatibilityReason = "removed" | "type_changed" | "invalid_value";

export interface SessionConfigRecoveryCandidate {
  configId: string;
  type: "select" | "boolean";
  value: string | boolean;
}

export interface SessionConfigIncompatibility {
  configId: string;
  reason: SessionConfigIncompatibilityReason;
}

export interface SessionConfigRecoveryPlan {
  candidates: SessionConfigRecoveryCandidate[];
  incompatibilities: SessionConfigIncompatibility[];
}

function isGroupedOptions(
  options: AcpSessionConfigOptionValueItem[] | AcpSessionConfigOptionGroup[]
): options is AcpSessionConfigOptionGroup[] {
  return options.length > 0 && "group" in options[0];
}

export function valueExistsInSchema(
  schema: AcpSessionConfigOption,
  value: string | boolean
): boolean {
  if (schema.type === "boolean") {
    return typeof value === "boolean";
  }
  if (typeof value !== "string" || schema.options.length === 0) {
    return false;
  }

  if (isGroupedOptions(schema.options)) {
    return schema.options.some((group) => group.options.some((item) => item.value === value));
  }
  return schema.options.some((item) => item.value === value);
}

export function planSessionConfigRecovery(
  persisted: AcpSessionConfigOption[],
  live: AcpSessionConfigOption[] | null
): SessionConfigRecoveryPlan {
  if (live === null) {
    return {
      candidates: persisted.map((option) => ({
        configId: option.id,
        type: option.type,
        value: option.currentValue,
      })),
      incompatibilities: [],
    };
  }

  const liveById = new Map(live.map((option) => [option.id, option]));
  const candidates: SessionConfigRecoveryCandidate[] = [];
  const incompatibilities: SessionConfigIncompatibility[] = [];

  for (const persistedOption of persisted) {
    const liveOption = liveById.get(persistedOption.id);
    if (!liveOption) {
      incompatibilities.push({ configId: persistedOption.id, reason: "removed" });
      continue;
    }
    if (liveOption.type !== persistedOption.type) {
      incompatibilities.push({ configId: persistedOption.id, reason: "type_changed" });
      continue;
    }
    if (!valueExistsInSchema(liveOption, persistedOption.currentValue)) {
      incompatibilities.push({ configId: persistedOption.id, reason: "invalid_value" });
      continue;
    }
    if (liveOption.currentValue !== persistedOption.currentValue) {
      candidates.push({
        configId: persistedOption.id,
        type: persistedOption.type,
        value: persistedOption.currentValue,
      });
    }
  }

  return { candidates, incompatibilities };
}

function fingerprintOptions(option: AcpSessionConfigOption): string[] {
  if (option.type === "boolean") {
    return [];
  }
  if (isGroupedOptions(option.options)) {
    return option.options
      .flatMap((group) => group.options.map((item) => `${group.group}:${item.value}`))
      .sort();
  }
  return option.options.map((item) => item.value).sort();
}

export function sessionConfigFingerprint(options: AcpSessionConfigOption[]): string {
  return JSON.stringify(
    options
      .map((option) => ({
        id: option.id,
        type: option.type,
        currentValue: option.currentValue,
        options: fingerprintOptions(option),
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  );
}
