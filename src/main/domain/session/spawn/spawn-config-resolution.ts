import type {
  AcpSessionConfigOption,
  AcpSessionConfigOptionGroup,
  AcpSessionConfigOptionValueItem,
  AcpSessionConfigSelect,
} from "@shared/types/acp-config";
import {
  sessionConfigFingerprint,
  valueExistsInSchema,
} from "@main/domain/session/chat/session-config-recovery";
import type {
  SpawnConfigResolutionCandidate,
  SpawnConfigResolutionIssue,
} from "@shared/types/fyllo-spawn-rpc";
import type { AcpSessionConfigOptionValue } from "@shared/types/acp-config";

export type SpawnSemanticConfigParameter = "model" | "thought_level";

export interface SpawnSemanticConfigResolution {
  status: "resolved" | "configuration_required";
  option?: AcpSessionConfigSelect;
  value?: string;
  issue?: SpawnConfigResolutionIssue;
}

export interface SpawnConfigRequest {
  model?: string;
  thought_level?: string;
  config?: Record<string, string | boolean>;
}

export interface SpawnConfigSetAction {
  optionId: string;
  type: AcpSessionConfigOption["type"];
  value: AcpSessionConfigOptionValue | boolean;
}

export type SpawnConfigPlan =
  | { status: "ready" }
  | { status: "apply"; action: SpawnConfigSetAction }
  | { status: "configuration_required"; issue: SpawnConfigResolutionIssue }
  | { status: "invalid"; message: string };

export interface SpawnConfigPlanningState {
  iterations: number;
  maxIterations: number;
  seenFingerprints: ReadonlySet<string>;
}

export type SpawnConfigPlanningObservation =
  | { status: "observed"; state: SpawnConfigPlanningState }
  | { status: "repeated"; state: SpawnConfigPlanningState }
  | { status: "limit_exceeded"; state: SpawnConfigPlanningState };

function isGroupedOptions(
  options: AcpSessionConfigSelect["options"]
): options is AcpSessionConfigOptionGroup[] {
  return options.length > 0 && "group" in options[0]!;
}

function toCandidate(
  item: AcpSessionConfigOptionValueItem,
  group?: string
): SpawnConfigResolutionCandidate {
  return {
    value: item.value,
    name: item.name,
    ...(group === undefined ? {} : { group }),
    ...(item.description === undefined ? {} : { description: item.description }),
  };
}

/** 将 ACP flat/grouped select schema按 Agent 原顺序展平，保留 provider/group 上下文。 */
export function flattenSpawnSelectOptions(
  option: AcpSessionConfigSelect
): SpawnConfigResolutionCandidate[] {
  if (!isGroupedOptions(option.options)) {
    return option.options.map((item) => toCandidate(item));
  }
  return option.options.flatMap((group) =>
    group.options.map((item) => toCandidate(item, group.group))
  );
}

function normalizeForExactMatch(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
}

function tokens(value: string): string[] {
  return normalizeForExactMatch(value)
    .split(/[/:\s_-]+/u)
    .filter(Boolean);
}

function containsAllTokens(candidate: string, queryTokens: string[]): boolean {
  const candidateTokens = tokens(candidate);
  return queryTokens.every((token) => candidateTokens.includes(token));
}

function matchesByTokenContainment(
  candidate: SpawnConfigResolutionCandidate,
  query: string
): boolean {
  const queryTokens = tokens(query);
  return (
    queryTokens.length > 0 &&
    (containsAllTokens(candidate.value, queryTokens) ||
      containsAllTokens(candidate.name, queryTokens))
  );
}

function matchingCandidates(
  candidates: SpawnConfigResolutionCandidate[],
  requested: string
): SpawnConfigResolutionCandidate[] {
  const exactValue = candidates.filter((candidate) => candidate.value === requested);
  if (exactValue.length > 0) return exactValue;

  const normalized = normalizeForExactMatch(requested);
  const normalizedValue = candidates.filter(
    (candidate) => normalizeForExactMatch(candidate.value) === normalized
  );
  if (normalizedValue.length > 0) return normalizedValue;

  const normalizedName = candidates.filter(
    (candidate) => normalizeForExactMatch(candidate.name) === normalized
  );
  if (normalizedName.length > 0) return normalizedName;

  return candidates.filter((candidate) => matchesByTokenContainment(candidate, requested));
}

function issue(
  parameter: SpawnSemanticConfigParameter,
  reason: SpawnConfigResolutionIssue["reason"],
  requested: string,
  option: AcpSessionConfigSelect | undefined,
  candidates: SpawnConfigResolutionCandidate[]
): SpawnConfigResolutionIssue {
  return {
    parameter,
    reason,
    requested,
    ...(option ? { optionId: option.id, category: parameter } : { category: parameter }),
    candidates,
  };
}

export function findUniqueSpawnSelectOption(
  options: AcpSessionConfigOption[],
  category: SpawnSemanticConfigParameter
): AcpSessionConfigSelect | undefined {
  const matches = options.filter(
    (option): option is AcpSessionConfigSelect =>
      option.type === "select" && option.category === category
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** 在 live snapshot 中解析语义字段；任何非唯一结果都保留候选而不替调用方决胜。 */
export function resolveSpawnSemanticConfig(
  options: AcpSessionConfigOption[],
  parameter: SpawnSemanticConfigParameter,
  requested: string
): SpawnSemanticConfigResolution {
  const categoryOptions = options.filter(
    (option): option is AcpSessionConfigSelect =>
      option.type === "select" && option.category === parameter
  );
  if (categoryOptions.length !== 1) {
    return {
      status: "configuration_required",
      issue: issue(parameter, "missing_category_option", requested, undefined, []),
    };
  }

  const option = categoryOptions[0]!;
  const candidates = flattenSpawnSelectOptions(option);
  const matches = matchingCandidates(candidates, requested);
  if (matches.length === 1) {
    return { status: "resolved", option, value: matches[0]!.value };
  }

  return {
    status: "configuration_required",
    issue: issue(
      parameter,
      matches.length === 0 ? "unsupported" : "ambiguous",
      requested,
      option,
      matches.length === 0 ? candidates : matches
    ),
  };
}

export function findSpawnConfigCandidateByExactValue(
  option: AcpSessionConfigSelect,
  value: string
): SpawnConfigResolutionCandidate | undefined {
  const matches = flattenSpawnSelectOptions(option).filter(
    (candidate) => candidate.value === value
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function categoryPriority(category: string | undefined): number {
  switch (category) {
    case "mode":
      return 0;
    case "model":
      return 1;
    case "model_config":
      return 2;
    case "thought_level":
      return 3;
    default:
      return 4;
  }
}

interface RawConstraint {
  option: AcpSessionConfigOption;
  optionId: string;
  value: string | boolean;
  order: number;
}

function invalid(message: string): SpawnConfigPlan {
  return { status: "invalid", message };
}

function actionFor(option: AcpSessionConfigOption, value: string | boolean): SpawnConfigSetAction {
  return { optionId: option.id, type: option.type, value };
}

function pendingAction(
  constraint: Pick<RawConstraint, "option" | "value">
): SpawnConfigSetAction | undefined {
  return constraint.option.currentValue === constraint.value
    ? undefined
    : actionFor(constraint.option, constraint.value);
}

function sortedRawConstraints(
  options: AcpSessionConfigOption[],
  request: SpawnConfigRequest
): RawConstraint[] | { error: SpawnConfigPlan } {
  const entries = Object.entries(request.config ?? {});
  const byId = new Map(options.map((option) => [option.id, option]));
  const constraints: RawConstraint[] = [];
  for (const [order, [optionId, value]] of entries.entries()) {
    const option = byId.get(optionId);
    if (!option) {
      return {
        error: invalid(`Unknown live config option ID: ${optionId}`),
      };
    }
    if (!valueExistsInSchema(option, value)) {
      return {
        error: invalid(`Invalid value for live config option ID: ${optionId}`),
      };
    }
    constraints.push({ option, optionId, value, order });
  }
  return constraints.sort(
    (left, right) =>
      categoryPriority(left.option.category) - categoryPriority(right.option.category) ||
      left.order - right.order
  );
}

function configurationRequired(resolution: SpawnSemanticConfigResolution): SpawnConfigPlan | null {
  return resolution.status === "configuration_required" && resolution.issue
    ? { status: "configuration_required", issue: resolution.issue }
    : null;
}

function resolveSemanticWithRawDisambiguation(
  options: AcpSessionConfigOption[],
  parameter: SpawnSemanticConfigParameter,
  requested: string,
  rawConstraints: RawConstraint[]
): SpawnSemanticConfigResolution | { status: "invalid"; message: string } {
  const resolution = resolveSpawnSemanticConfig(options, parameter, requested);
  const issue = resolution.issue;
  const rawOptionId = resolution.option?.id ?? issue?.optionId;
  const raw = rawOptionId
    ? rawConstraints.find((constraint) => constraint.optionId === rawOptionId)
    : undefined;

  if (resolution.status === "resolved") {
    if (raw && raw.value !== resolution.value) {
      return {
        status: "invalid",
        message: `Semantic ${parameter} value conflicts with exact raw option ID ${raw.optionId}`,
      };
    }
    return resolution;
  }

  if (
    raw &&
    issue?.reason === "ambiguous" &&
    typeof raw.value === "string" &&
    issue.candidates.some((candidate) => candidate.value === raw.value)
  ) {
    const option = findUniqueSpawnSelectOption(options, parameter);
    const candidate = option && findSpawnConfigCandidateByExactValue(option, raw.value);
    if (option && candidate) return { status: "resolved", option, value: candidate.value };
  }

  if (raw && issue?.reason !== "missing_category_option") {
    return {
      status: "invalid",
      message: `Semantic ${parameter} value cannot be reconciled with exact raw option ID ${raw.optionId}`,
    };
  }
  return resolution;
}

function rawForCategory(
  constraints: RawConstraint[],
  category: string | undefined,
  excludedOptionId?: string
): RawConstraint[] {
  return constraints.filter(
    (constraint) =>
      constraint.option.category === category && constraint.optionId !== excludedOptionId
  );
}

function firstPending(constraints: RawConstraint[]): SpawnConfigSetAction | undefined {
  for (const constraint of constraints) {
    const action = pendingAction(constraint);
    if (action) return action;
  }
  return undefined;
}

/**
 * 将语义请求和 exact-ID raw 请求合并成一个逐步 desired-state 计划。
 * 每次只返回当前 live snapshot 的下一步，调用方在 set response 后必须重新规划。
 */
export function planSpawnConfig(
  options: AcpSessionConfigOption[],
  request: SpawnConfigRequest
): SpawnConfigPlan {
  const rawResult = sortedRawConstraints(options, request);
  if (!Array.isArray(rawResult)) return rawResult.error;
  const rawConstraints = rawResult;

  const modeAction = firstPending(rawForCategory(rawConstraints, "mode"));
  if (modeAction) return { status: "apply", action: modeAction };

  let semanticModelOptionId: string | undefined;
  if (request.model !== undefined) {
    const resolution = resolveSemanticWithRawDisambiguation(
      options,
      "model",
      request.model,
      rawConstraints
    );
    if (resolution.status === "invalid") return invalid(resolution.message);
    const required = configurationRequired(resolution);
    if (required) return required;
    semanticModelOptionId = resolution.option!.id;
    const modelAction = pendingAction({
      option: resolution.option!,
      value: resolution.value!,
    });
    if (modelAction) return { status: "apply", action: modelAction };
  }

  const rawModelAction = firstPending(
    rawForCategory(rawConstraints, "model", semanticModelOptionId)
  );
  if (rawModelAction) return { status: "apply", action: rawModelAction };

  const modelConfigAction = firstPending(rawForCategory(rawConstraints, "model_config"));
  if (modelConfigAction) return { status: "apply", action: modelConfigAction };

  let semanticThoughtOptionId: string | undefined;
  if (request.thought_level !== undefined) {
    const resolution = resolveSemanticWithRawDisambiguation(
      options,
      "thought_level",
      request.thought_level,
      rawConstraints
    );
    if (resolution.status === "invalid") return invalid(resolution.message);
    const required = configurationRequired(resolution);
    if (required) return required;
    semanticThoughtOptionId = resolution.option!.id;
    const thoughtAction = pendingAction({
      option: resolution.option!,
      value: resolution.value!,
    });
    if (thoughtAction) return { status: "apply", action: thoughtAction };
  }

  const rawThoughtAction = firstPending(
    rawForCategory(rawConstraints, "thought_level", semanticThoughtOptionId)
  );
  if (rawThoughtAction) return { status: "apply", action: rawThoughtAction };

  const otherAction = firstPending(
    rawConstraints.filter(
      (constraint) =>
        categoryPriority(constraint.option.category) === 4 &&
        constraint.optionId !== semanticModelOptionId &&
        constraint.optionId !== semanticThoughtOptionId
    )
  );
  if (otherAction) return { status: "apply", action: otherAction };

  return { status: "ready" };
}

export function createSpawnConfigPlanningState(
  request: SpawnConfigRequest
): SpawnConfigPlanningState {
  const constraintCount =
    Object.keys(request.config ?? {}).length +
    Number(request.model !== undefined) +
    Number(request.thought_level !== undefined);
  return {
    iterations: 0,
    maxIterations: Math.max(4, (constraintCount + 1) * 3),
    seenFingerprints: new Set<string>(),
  };
}

export function observeSpawnConfigSnapshot(
  state: SpawnConfigPlanningState,
  options: AcpSessionConfigOption[]
): SpawnConfigPlanningObservation {
  const fingerprint = sessionConfigFingerprint(options);
  if (state.seenFingerprints.has(fingerprint)) {
    return { status: "repeated", state };
  }
  const seenFingerprints = new Set(state.seenFingerprints);
  seenFingerprints.add(fingerprint);
  const nextState: SpawnConfigPlanningState = {
    ...state,
    iterations: state.iterations + 1,
    seenFingerprints,
  };
  return nextState.iterations > nextState.maxIterations
    ? { status: "limit_exceeded", state: nextState }
    : { status: "observed", state: nextState };
}
