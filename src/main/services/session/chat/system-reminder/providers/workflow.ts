const WORKFLOW_CAPABILITY_SECTION = [
  "<workflow-capability>",
  "当用户明确要求把当前流程保存或复用为 workflow 时，先调用 `describe_workflow_schema` 了解格式，再用 `propose_workflow` 提交生成结果供用户确认。合法但当前运行时不支持的 definition 可以先进入确认卡片；真正执行前由 `trigger_workflow` 做能力校验。",
  "</workflow-capability>",
].join("\n");

export function resolveWorkflowCapabilitySection(): string {
  return WORKFLOW_CAPABILITY_SECTION;
}
