import { load } from "js-yaml";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import type {
  WorkflowActionOp,
  WorkflowActionStep,
  WorkflowAgentStep,
  WorkflowArtifactSchema,
  WorkflowDefinition,
  WorkflowGate,
  WorkflowContextKind,
  WorkflowStep,
  WorkflowTransition,
  WorkflowWaitStep,
} from "@shared/types/workflow";

export interface WorkflowValidationIssue {
  code: typeof IpcErrorCodes.WORKFLOW_DEFINITION_INVALID;
  message: string;
  field?: string;
  stageId?: string;
  feature?: string;
  refs?: string[];
}

export class WorkflowDefinitionValidationError extends Error {
  readonly code = IpcErrorCodes.WORKFLOW_DEFINITION_INVALID;
  readonly issues: WorkflowValidationIssue[];
  readonly details: { issues: WorkflowValidationIssue[] };

  constructor(issues: WorkflowValidationIssue[]) {
    super(issues.map((issue) => issue.message).join("；"));
    this.name = "WorkflowDefinitionValidationError";
    this.issues = issues;
    this.details = { issues };
  }
}

type RecordValue = Record<string, unknown>;

interface TemplateReference {
  namespace: string;
  reference: string;
  field: string;
  stageId: string;
}

const workflowKeys = new Set([
  "name",
  "version",
  "description",
  "requires",
  "confirmStart",
  "stages",
]);
const stageKeys = new Set([
  "id",
  "name",
  "kind",
  "next",
  "terminal",
  "agent",
  "context",
  "prompt",
  "produces",
  "gate",
  "mcp",
  "skills",
  "op",
  "confirm",
  "idempotencyKey",
  "retry",
  "for",
  "timeoutMs",
  "onTimeout",
]);
const artifactSchemas = new Set<WorkflowArtifactSchema>([
  "diff",
  "verdict",
  "plan",
  "test-report",
  "freeform",
]);
const contextKinds = new Set(["proposal", "plan", "task", "chat"]);
const actionKinds = new Set([
  "git.branch",
  "git.commit",
  "scm.open-pr",
  "tracker.transition",
  "tracker.comment",
  "exec",
  "webhook",
]);
const externalActionKinds = new Set([
  "scm.open-pr",
  "tracker.transition",
  "tracker.comment",
  "webhook",
]);

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function has(record: RecordValue, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function addIssue(
  issues: WorkflowValidationIssue[],
  message: string,
  field: string,
  options: Omit<WorkflowValidationIssue, "code" | "message" | "field"> = {}
): void {
  issues.push({
    code: IpcErrorCodes.WORKFLOW_DEFINITION_INVALID,
    message,
    field,
    ...options,
  });
}

function addUnknownFieldIssues(
  record: RecordValue,
  allowed: Set<string>,
  field: string,
  issues: WorkflowValidationIssue[],
  stageId?: string
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      addIssue(issues, `不支持字段 ${field}.${key}`, `${field}.${key}`, { stageId });
    }
  }
}

function recordAt(
  value: unknown,
  field: string,
  issues: WorkflowValidationIssue[],
  stageId?: string
): RecordValue | null {
  if (!isRecord(value)) {
    addIssue(issues, `${field} 必须是对象`, field, { stageId });
    return null;
  }
  return value;
}

function stringAt(
  record: RecordValue,
  key: string,
  field: string,
  issues: WorkflowValidationIssue[],
  options: { required?: boolean; stageId?: string } = {}
): string | undefined {
  const value = record[key];
  if (value === undefined && !options.required) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    addIssue(issues, `${field} 必须是非空字符串`, field, { stageId: options.stageId });
    return undefined;
  }
  return value;
}

function booleanAt(
  record: RecordValue,
  key: string,
  field: string,
  issues: WorkflowValidationIssue[],
  options: { defaultValue?: boolean; stageId?: string } = {}
): boolean | undefined {
  const value = record[key];
  if (value === undefined && options.defaultValue !== undefined) return options.defaultValue;
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    addIssue(issues, `${field} 必须是 boolean`, field, { stageId: options.stageId });
    return undefined;
  }
  return value;
}

function stringListAt(
  record: RecordValue,
  key: string,
  field: string,
  issues: WorkflowValidationIssue[],
  stageId: string
): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    addIssue(issues, `${field} 必须是非空字符串数组`, field, { stageId });
    return undefined;
  }
  return value as string[];
}

function parseTransition(
  value: unknown,
  field: string,
  issues: WorkflowValidationIssue[],
  stageId: string
): WorkflowTransition | null {
  const record = recordAt(value, field, issues, stageId);
  if (!record) return null;
  addUnknownFieldIssues(record, new Set(["on", "goto", "maxLoops"]), field, issues, stageId);

  const on = stringAt(record, "on", `${field}.on`, issues, { required: true, stageId });
  const goto = stringAt(record, "goto", `${field}.goto`, issues, { required: true, stageId });
  const maxLoopsValue = record.maxLoops;
  let maxLoops: number | undefined;
  if (maxLoopsValue !== undefined) {
    if (
      typeof maxLoopsValue !== "number" ||
      !Number.isInteger(maxLoopsValue) ||
      maxLoopsValue < 1
    ) {
      addIssue(issues, `${field}.maxLoops 必须是正整数`, `${field}.maxLoops`, { stageId });
    } else {
      maxLoops = maxLoopsValue;
    }
  }

  if (on !== "pass" && on !== "fail" && on !== "signal") {
    addIssue(issues, `${field}.on 必须是 pass、fail 或 signal`, `${field}.on`, { stageId });
  }
  if (!on || !goto || (on !== "pass" && on !== "fail" && on !== "signal")) return null;
  return maxLoops === undefined ? { on, goto } : { on, goto, maxLoops };
}

function parseTransitions(
  value: unknown,
  field: string,
  issues: WorkflowValidationIssue[],
  stageId: string
): WorkflowTransition[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, `${field} 必须是非空数组`, field, { stageId });
    return undefined;
  }
  const transitions: WorkflowTransition[] = [];
  const seenEvents = new Set<string>();
  value.forEach((entry, index) => {
    const transition = parseTransition(entry, `${field}[${index}]`, issues, stageId);
    if (!transition) return;
    if (seenEvents.has(transition.on)) {
      addIssue(issues, `${field} 不得重复声明 ${transition.on}`, field, { stageId });
    }
    seenEvents.add(transition.on);
    transitions.push(transition);
  });
  return transitions;
}

function parseArtifact(
  value: unknown,
  field: string,
  issues: WorkflowValidationIssue[],
  stageId: string
): { id: string; schema: WorkflowArtifactSchema } | null {
  const record = recordAt(value, field, issues, stageId);
  if (!record) return null;
  addUnknownFieldIssues(record, new Set(["id", "schema"]), field, issues, stageId);
  const id = stringAt(record, "id", `${field}.id`, issues, { required: true, stageId });
  const schema = stringAt(record, "schema", `${field}.schema`, issues, {
    required: true,
    stageId,
  });
  if (!schema || !artifactSchemas.has(schema as WorkflowArtifactSchema)) {
    addIssue(issues, `${field}.schema 不是合法 artifact schema`, `${field}.schema`, { stageId });
  }
  if (!id || !schema || !artifactSchemas.has(schema as WorkflowArtifactSchema)) return null;
  return { id, schema: schema as WorkflowArtifactSchema };
}

function parseGate(
  value: unknown,
  field: string,
  issues: WorkflowValidationIssue[],
  stageId: string
): WorkflowGate | undefined {
  if (value === undefined) return undefined;
  const record = recordAt(value, field, issues, stageId);
  if (!record) return undefined;
  const type = stringAt(record, "type", `${field}.type`, issues, { required: true, stageId });
  if (type === "expr") {
    addUnknownFieldIssues(record, new Set(["type", "expr"]), field, issues, stageId);
    const expr = stringAt(record, "expr", `${field}.expr`, issues, { required: true, stageId });
    return expr ? { type, expr } : undefined;
  }
  if (type === "verdict") {
    addUnknownFieldIssues(record, new Set(["type", "maxSeverity"]), field, issues, stageId);
    const maxSeverity = stringAt(record, "maxSeverity", `${field}.maxSeverity`, issues, {
      required: true,
      stageId,
    });
    if (maxSeverity !== "low" && maxSeverity !== "medium" && maxSeverity !== "high") {
      addIssue(issues, `${field}.maxSeverity 必须是 low、medium 或 high`, `${field}.maxSeverity`, {
        stageId,
      });
      return undefined;
    }
    return { type, maxSeverity };
  }
  if (type === "human") {
    addUnknownFieldIssues(record, new Set(["type", "prompt"]), field, issues, stageId);
    const prompt = stringAt(record, "prompt", `${field}.prompt`, issues, {
      required: true,
      stageId,
    });
    return prompt ? { type, prompt } : undefined;
  }
  addIssue(issues, `${field}.type 不是合法 gate 类型`, `${field}.type`, { stageId });
  return undefined;
}

function parseActionOp(
  value: unknown,
  field: string,
  issues: WorkflowValidationIssue[],
  stageId: string
): WorkflowActionOp | null {
  const record = recordAt(value, field, issues, stageId);
  if (!record) return null;
  const type = stringAt(record, "type", `${field}.type`, issues, { required: true, stageId });
  if (!type || !actionKinds.has(type)) {
    addIssue(issues, `${field}.type 不是合法 Action op`, `${field}.type`, { stageId });
    return null;
  }

  if (type === "exec") {
    addUnknownFieldIssues(record, new Set(["type", "command", "cwd"]), field, issues, stageId);
    const command = stringAt(record, "command", `${field}.command`, issues, {
      required: true,
      stageId,
    });
    const cwd = stringAt(record, "cwd", `${field}.cwd`, issues, { stageId });
    return command ? (cwd ? { type, command, cwd } : { type, command }) : null;
  }
  if (type === "git.branch") {
    addUnknownFieldIssues(record, new Set(["type", "name"]), field, issues, stageId);
    const name = stringAt(record, "name", `${field}.name`, issues, { required: true, stageId });
    return name ? { type, name } : null;
  }
  if (type === "git.commit") {
    addUnknownFieldIssues(record, new Set(["type", "message"]), field, issues, stageId);
    const message = stringAt(record, "message", `${field}.message`, issues, {
      required: true,
      stageId,
    });
    return message ? { type, message } : null;
  }
  if (type === "scm.open-pr") {
    addUnknownFieldIssues(
      record,
      new Set(["type", "title", "body", "base"]),
      field,
      issues,
      stageId
    );
    const title = stringAt(record, "title", `${field}.title`, issues, { required: true, stageId });
    const body = stringAt(record, "body", `${field}.body`, issues, { stageId });
    const base = stringAt(record, "base", `${field}.base`, issues, { required: true, stageId });
    return title && base ? (body ? { type, title, body, base } : { type, title, base }) : null;
  }
  if (type === "tracker.transition") {
    addUnknownFieldIssues(record, new Set(["type", "to"]), field, issues, stageId);
    const to = stringAt(record, "to", `${field}.to`, issues, { required: true, stageId });
    return to ? { type, to } : null;
  }
  if (type === "tracker.comment") {
    addUnknownFieldIssues(record, new Set(["type", "body"]), field, issues, stageId);
    const body = stringAt(record, "body", `${field}.body`, issues, { required: true, stageId });
    return body ? { type, body } : null;
  }

  addUnknownFieldIssues(record, new Set(["type", "url", "method", "body"]), field, issues, stageId);
  const url = stringAt(record, "url", `${field}.url`, issues, { required: true, stageId });
  const method = stringAt(record, "method", `${field}.method`, issues, { stageId });
  const body = stringAt(record, "body", `${field}.body`, issues, { required: true, stageId });
  if (method !== undefined && method !== "POST" && method !== "PUT") {
    addIssue(issues, `${field}.method 必须是 POST 或 PUT`, `${field}.method`, { stageId });
  }
  if (!url || !body || (method !== undefined && method !== "POST" && method !== "PUT")) {
    return null;
  }
  return method ? { type: "webhook", url, method, body } : { type: "webhook", url, body };
}

function parseStage(
  value: unknown,
  index: number,
  issues: WorkflowValidationIssue[],
  templates: TemplateReference[]
): WorkflowStep | null {
  const field = `stages[${index}]`;
  const record = recordAt(value, field, issues);
  if (!record) return null;
  addUnknownFieldIssues(record, stageKeys, field, issues);
  const id = stringAt(record, "id", `${field}.id`, issues, { required: true });
  const stageId = id ?? field;
  const name = stringAt(record, "name", `${field}.name`, issues, { stageId });
  const kind = stringAt(record, "kind", `${field}.kind`, issues, { required: true, stageId });

  const hasNext = has(record, "next");
  const terminal = booleanAt(record, "terminal", `${field}.terminal`, issues, { stageId });
  if (hasNext && terminal === true) {
    addIssue(issues, `${field} 不能同时设置 next 和 terminal: true`, field, { stageId });
  }
  if (!hasNext && terminal !== true) {
    addIssue(issues, `${field} 必须设置 next 或 terminal: true`, field, { stageId });
  }
  const next = hasNext
    ? parseTransitions(record.next, `${field}.next`, issues, stageId)
    : undefined;

  if (kind === "agent") {
    addUnknownFieldIssues(
      record,
      new Set([
        "id",
        "name",
        "kind",
        "next",
        "terminal",
        "agent",
        "context",
        "prompt",
        "produces",
        "gate",
        "mcp",
        "skills",
      ]),
      field,
      issues,
      stageId
    );
    const agent = stringAt(record, "agent", `${field}.agent`, issues, { stageId });
    const contextValue = stringAt(record, "context", `${field}.context`, issues, { stageId });
    const context = contextValue === undefined ? "fresh" : contextValue;
    if (context !== "inherit" && context !== "fresh") {
      addIssue(issues, `${field}.context 必须是 inherit 或 fresh`, `${field}.context`, { stageId });
    }
    const prompt = stringAt(record, "prompt", `${field}.prompt`, issues, {
      required: true,
      stageId,
    });
    const produces = parseArtifact(record.produces, `${field}.produces`, issues, stageId);
    const gate = parseGate(record.gate, `${field}.gate`, issues, stageId);
    const mcp = stringListAt(record, "mcp", `${field}.mcp`, issues, stageId);
    const skills = stringListAt(record, "skills", `${field}.skills`, issues, stageId);
    if (prompt) templates.push(...collectTemplateReferences(prompt, `${field}.prompt`, stageId));
    if (gate?.type === "human") {
      templates.push(...collectTemplateReferences(gate.prompt, `${field}.gate.prompt`, stageId));
    }
    if (!id || !prompt || !produces || (context !== "inherit" && context !== "fresh")) return null;
    const step: WorkflowAgentStep = {
      id,
      ...(name ? { name } : {}),
      kind,
      ...(next ? { next } : {}),
      ...(terminal !== undefined ? { terminal } : {}),
      ...(agent ? { agent } : {}),
      context,
      prompt,
      produces,
      ...(gate ? { gate } : {}),
      ...(mcp ? { mcp } : {}),
      ...(skills ? { skills } : {}),
    };
    return step;
  }

  if (kind === "action") {
    addUnknownFieldIssues(
      record,
      new Set([
        "id",
        "name",
        "kind",
        "next",
        "terminal",
        "op",
        "confirm",
        "idempotencyKey",
        "retry",
      ]),
      field,
      issues,
      stageId
    );
    const op = parseActionOp(record.op, `${field}.op`, issues, stageId);
    const confirm = booleanAt(record, "confirm", `${field}.confirm`, issues, {
      defaultValue: true,
      stageId,
    });
    const idempotencyKey = stringAt(record, "idempotencyKey", `${field}.idempotencyKey`, issues, {
      stageId,
    });
    const retryRecord =
      record.retry === undefined
        ? undefined
        : recordAt(record.retry, `${field}.retry`, issues, stageId);
    let retry: { max: number; backoffMs: number } | undefined;
    if (retryRecord) {
      addUnknownFieldIssues(
        retryRecord,
        new Set(["max", "backoffMs"]),
        `${field}.retry`,
        issues,
        stageId
      );
      const max = retryRecord.max;
      const backoffMs = retryRecord.backoffMs;
      if (typeof max !== "number" || !Number.isInteger(max) || max < 1) {
        addIssue(issues, `${field}.retry.max 必须是正整数`, `${field}.retry.max`, { stageId });
      }
      if (typeof backoffMs !== "number" || !Number.isInteger(backoffMs) || backoffMs < 0) {
        addIssue(issues, `${field}.retry.backoffMs 必须是非负整数`, `${field}.retry.backoffMs`, {
          stageId,
        });
      }
      if (
        typeof max === "number" &&
        Number.isInteger(max) &&
        max >= 1 &&
        typeof backoffMs === "number" &&
        Number.isInteger(backoffMs) &&
        backoffMs >= 0
      ) {
        retry = { max, backoffMs };
      }
    }
    if (op && externalActionKinds.has(op.type) && !idempotencyKey) {
      addIssue(
        issues,
        `${field} 的 ${op.type} 必须设置 idempotencyKey`,
        `${field}.idempotencyKey`,
        {
          stageId,
          feature: "idempotencyKey",
        }
      );
    }
    if (op) {
      for (const [key, value] of Object.entries(op)) {
        if (key !== "type" && typeof value === "string") {
          templates.push(...collectTemplateReferences(value, `${field}.op.${key}`, stageId));
        }
      }
    }
    if (idempotencyKey) {
      templates.push(
        ...collectTemplateReferences(idempotencyKey, `${field}.idempotencyKey`, stageId)
      );
    }
    if (!id || !op || confirm === undefined) return null;
    const step: WorkflowActionStep = {
      id,
      ...(name ? { name } : {}),
      kind,
      ...(next ? { next } : {}),
      ...(terminal !== undefined ? { terminal } : {}),
      op,
      confirm,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(retry ? { retry } : {}),
    };
    return step;
  }

  if (kind === "wait") {
    addUnknownFieldIssues(
      record,
      new Set(["id", "name", "kind", "next", "terminal", "for", "timeoutMs", "onTimeout"]),
      field,
      issues,
      stageId
    );
    const waitFor = stringAt(record, "for", `${field}.for`, issues, { required: true, stageId });
    const timeoutValue = record.timeoutMs;
    let timeoutMs: number | undefined;
    if (
      timeoutValue !== undefined &&
      (typeof timeoutValue !== "number" || !Number.isInteger(timeoutValue) || timeoutValue < 1)
    ) {
      addIssue(issues, `${field}.timeoutMs 必须是正整数`, `${field}.timeoutMs`, { stageId });
    } else if (typeof timeoutValue === "number") {
      timeoutMs = timeoutValue;
    }
    const onTimeoutValue = stringAt(record, "onTimeout", `${field}.onTimeout`, issues, { stageId });
    const onTimeout = onTimeoutValue === undefined ? "ask" : onTimeoutValue;
    if (onTimeout !== "fail" && onTimeout !== "continue" && onTimeout !== "ask") {
      addIssue(issues, `${field}.onTimeout 必须是 fail、continue 或 ask`, `${field}.onTimeout`, {
        stageId,
      });
    }
    if (waitFor !== "check-result" && waitFor !== "review-decision" && waitFor !== "manual") {
      addIssue(issues, `${field}.for 不是合法 signal 类型`, `${field}.for`, { stageId });
    }
    if (
      !id ||
      !waitFor ||
      (waitFor !== "check-result" && waitFor !== "review-decision" && waitFor !== "manual") ||
      (onTimeout !== "fail" && onTimeout !== "continue" && onTimeout !== "ask")
    ) {
      return null;
    }
    const step: WorkflowWaitStep = {
      id,
      ...(name ? { name } : {}),
      kind,
      ...(next ? { next } : {}),
      ...(terminal !== undefined ? { terminal } : {}),
      for: waitFor,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      onTimeout,
    };
    return step;
  }

  addIssue(issues, `${field}.kind 必须是 agent、action 或 wait`, `${field}.kind`, { stageId });
  return null;
}

function collectTemplateReferences(
  value: string,
  field: string,
  stageId: string
): TemplateReference[] {
  const references: TemplateReference[] = [];
  const pattern = /\{\{\s*([A-Za-z][A-Za-z0-9_-]*)\.([^}|\s]+)(?:\s*\|[^}]*)?\s*\}\}/g;
  for (const match of value.matchAll(pattern)) {
    const namespace = match[1];
    if (namespace) references.push({ namespace, reference: match[0], field, stageId });
  }
  return references;
}

function validateTemplateReferences(
  references: TemplateReference[],
  requires: string[],
  artifactIds: Set<string>,
  issues: WorkflowValidationIssue[]
): void {
  const allowed = new Set(["run", "artifacts"]);
  for (const required of requires) {
    allowed.add(required);
    if (required === "proposal") allowed.add("tasks");
  }
  for (const reference of references) {
    if (reference.namespace === "") continue;
    const refs = [
      ...reference.reference.matchAll(/\{\{\s*[A-Za-z][A-Za-z0-9_-]*\.([^}|\s]+)/g),
    ].map((match) => match[1]);
    if (!allowed.has(reference.namespace)) {
      addIssue(
        issues,
        `${reference.field} 使用了未声明的模板命名空间 ${reference.namespace}`,
        reference.field,
        { stageId: reference.stageId, feature: "template-namespace", refs }
      );
      continue;
    }
    if (reference.namespace === "artifacts") {
      const artifactRef = refs[0]?.split(".")[0];
      if (artifactRef && !artifactIds.has(artifactRef)) {
        addIssue(
          issues,
          `${reference.field} 引用了不存在的 artifact ${artifactRef}`,
          reference.field,
          { stageId: reference.stageId, feature: "artifact-reference", refs: [artifactRef] }
        );
      }
    }
  }
}

function canReach(
  from: string,
  target: string,
  transitionsByStage: Map<string, WorkflowTransition[]>
): boolean {
  const pending = [from];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    if (current === target) return true;
    seen.add(current);
    for (const transition of transitionsByStage.get(current) ?? []) pending.push(transition.goto);
  }
  return false;
}

function validateGraph(stages: WorkflowStep[], issues: WorkflowValidationIssue[]): void {
  const stageIds = new Set(stages.map((stage) => stage.id));
  const transitionsByStage = new Map<string, WorkflowTransition[]>();
  for (const stage of stages) {
    const transitions = stage.next ?? [];
    transitionsByStage.set(stage.id, transitions);
    for (const transition of transitions) {
      if (!stageIds.has(transition.goto)) {
        addIssue(
          issues,
          `stages.${stage.id}.next.goto 指向不存在的 stage ${transition.goto}`,
          `stages.${stage.id}.next`,
          { stageId: stage.id, refs: [transition.goto] }
        );
      } else if (
        canReach(transition.goto, stage.id, transitionsByStage) &&
        transition.maxLoops === undefined
      ) {
        addIssue(
          issues,
          `stages.${stage.id}.next.goto ${transition.goto} 是回边，必须设置 maxLoops`,
          `stages.${stage.id}.next`,
          { stageId: stage.id, feature: "maxLoops", refs: [transition.goto] }
        );
      }
    }
  }

  const entry = stages[0];
  if (entry) {
    const reachable = new Set<string>();
    const pending = [entry.id];
    while (pending.length > 0) {
      const stageId = pending.pop();
      if (!stageId || reachable.has(stageId)) continue;
      reachable.add(stageId);
      for (const transition of transitionsByStage.get(stageId) ?? []) {
        if (stageIds.has(transition.goto)) pending.push(transition.goto);
      }
    }
    for (const stage of stages) {
      if (!reachable.has(stage.id)) {
        addIssue(issues, `stage ${stage.id} 从入口不可达`, `stages.${stage.id}`, {
          stageId: stage.id,
        });
      }
    }
  }
  if (!stages.some((stage) => stage.terminal === true)) {
    addIssue(issues, "workflow 至少需要一个 terminal stage", "stages", { feature: "terminal" });
  }
}

function validateStageSemantics(
  stages: WorkflowStep[],
  requires: string[],
  issues: WorkflowValidationIssue[],
  templates: TemplateReference[]
): void {
  const artifactIds = new Set<string>();
  for (const stage of stages) {
    if (stage.kind === "agent") {
      if (artifactIds.has(stage.produces.id)) {
        addIssue(
          issues,
          `artifact id ${stage.produces.id} 重复`,
          `stages.${stage.id}.produces.id`,
          {
            stageId: stage.id,
            refs: [stage.produces.id],
          }
        );
      }
      artifactIds.add(stage.produces.id);
      if (stage.gate?.type === "verdict" && stage.produces.schema !== "verdict") {
        addIssue(
          issues,
          "verdict gate 要求 produces.schema 为 verdict",
          `stages.${stage.id}.gate`,
          { stageId: stage.id, feature: "verdict", refs: [stage.produces.id] }
        );
      }
      if (stage.gate?.type === "expr") {
        templates.push({
          namespace: "",
          reference: stage.gate.expr,
          field: `stages.${stage.id}.gate.expr`,
          stageId: stage.id,
        });
      }
      if (stage.context === "inherit" && !requires.includes("chat")) {
        addIssue(issues, "context: inherit 要求 requires 包含 chat", `stages.${stage.id}.context`, {
          stageId: stage.id,
          feature: "context.inherit",
          refs: ["chat"],
        });
      }
    }
  }
  const exprReferences = templates.filter((reference) => reference.field.endsWith(".gate.expr"));
  validateTemplateReferences(templates, requires, artifactIds, issues);
  for (const reference of exprReferences) {
    const artifactReferences = [
      ...reference.reference.matchAll(/\bartifacts\.([A-Za-z0-9][A-Za-z0-9_-]*)/g),
    ].map((match) => match[1]);
    const missing = artifactReferences.filter(
      (artifactId): artifactId is string => Boolean(artifactId) && !artifactIds.has(artifactId)
    );
    if (missing.length > 0) {
      addIssue(issues, `${reference.field} 引用了不存在的 artifact`, reference.field, {
        stageId: reference.stageId,
        feature: "artifact-reference",
        refs: missing,
      });
    }
  }
}

export function validateWorkflowDefinition(value: unknown): WorkflowDefinition {
  const issues: WorkflowValidationIssue[] = [];
  const document = recordAt(value, "workflow", issues);
  if (!document) throw new WorkflowDefinitionValidationError(issues);
  addUnknownFieldIssues(document, workflowKeys, "workflow", issues);

  const name = stringAt(document, "name", "name", issues, { required: true });
  if (document.version !== 2) {
    addIssue(issues, "version 必须是数字 2", "version", { refs: ["2"] });
  }
  const description = stringAt(document, "description", "description", issues);
  const requiresValue = document.requires;
  let requires: WorkflowContextKind[] = [];
  if (requiresValue !== undefined) {
    if (
      !Array.isArray(requiresValue) ||
      requiresValue.some((item) => typeof item !== "string" || !contextKinds.has(item))
    ) {
      addIssue(issues, "requires 必须是 ContextKind 字符串数组", "requires");
    } else {
      requires = requiresValue as WorkflowContextKind[];
      if (new Set(requires).size !== requires.length) {
        addIssue(issues, "requires 不得重复声明上下文", "requires");
      }
    }
  }
  const confirmStart = booleanAt(document, "confirmStart", "confirmStart", issues, {
    defaultValue: false,
  });
  const templates: TemplateReference[] = [];
  const rawStages = document.stages;
  if (!Array.isArray(rawStages) || rawStages.length === 0) {
    addIssue(issues, "stages 必须是至少包含一个 stage 的数组", "stages");
  }
  const stages: WorkflowStep[] = [];
  const stageIds = new Set<string>();
  if (Array.isArray(rawStages)) {
    rawStages.forEach((rawStage, index) => {
      const stageRecord = isRecord(rawStage) ? rawStage : undefined;
      const rawId = stageRecord?.id;
      if (typeof rawId === "string" && rawId.trim() !== "") {
        if (stageIds.has(rawId)) {
          addIssue(issues, `stage id ${rawId} 重复`, `stages[${index}].id`, {
            stageId: rawId,
            refs: [rawId],
          });
        }
        if (rawId === "." || rawId === ".." || /[\\/\0]/.test(rawId)) {
          addIssue(issues, `stage id ${rawId} 不能用于存储路径`, `stages[${index}].id`, {
            stageId: rawId,
          });
        }
        stageIds.add(rawId);
      }
      const stage = parseStage(rawStage, index, issues, templates);
      if (stage) stages.push(stage);
    });
  }
  validateGraph(stages, issues);
  validateStageSemantics(stages, requires, issues, templates);

  if (issues.length > 0) throw new WorkflowDefinitionValidationError(issues);
  return {
    name: name as string,
    version: 2,
    ...(description ? { description } : {}),
    requires,
    confirmStart: confirmStart ?? false,
    stages,
  };
}

export function parseWorkflowYaml(yaml: string): WorkflowDefinition {
  if (typeof yaml !== "string") {
    throw new WorkflowDefinitionValidationError([
      {
        code: IpcErrorCodes.WORKFLOW_DEFINITION_INVALID,
        message: "YAML 必须是字符串",
        field: "yaml",
      },
    ]);
  }
  let document: unknown;
  try {
    document = load(yaml);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "YAML 语法无效";
    throw new WorkflowDefinitionValidationError([
      {
        code: IpcErrorCodes.WORKFLOW_DEFINITION_INVALID,
        message: `YAML 语法无效: ${message}`,
        field: "yaml",
      },
    ]);
  }
  return validateWorkflowDefinition(document);
}
