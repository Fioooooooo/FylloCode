<script setup lang="ts">
import { computed, ref } from "vue";

type TemplateSource = "built-in" | "custom";
type CurrentView = "empty" | "template-editor";
type StageBadgeColor = "primary" | "info" | "success" | "warning" | "neutral";

interface WorkflowTemplate {
  id: string;
  name: string;
  source: TemplateSource;
  isDefault: boolean;
  yaml: string;
}

interface ParsedStage {
  id: string;
  name: string;
  type: string;
  agent: string;
  prompt: string;
  when: string;
  onFailure: string;
  mcp: string[];
  skills: string[];
}

interface ParsedWorkflow {
  name: string;
  description: string;
  version: string;
  stages: ParsedStage[];
}

const currentView = ref<CurrentView>("empty");
const selectedTemplateId = ref<string | null>(null);
const yamlContent = ref("");

const templates = ref<WorkflowTemplate[]>([
  {
    id: "default",
    name: "默认流水线",
    source: "built-in",
    isDefault: true,
    yaml: `name: 默认流水线
description: 执行变更、完成代码审查，并创建拉取请求
version: 1
stages:
  - id: apply
    name: 应用变更
    type: apply
    agent: codex
    prompt: 按照已确认的 proposal 任务实施代码变更。
    when: proposal 状态为“准备执行”
    onFailure: 停止后续阶段
    mcp:
      - 文件系统
    skills:
      - openspec-apply-change
  - id: code-review
    name: 代码审查
    type: code-review
    agent: codex
    prompt: 检查实现中的缺陷、行为回归和缺失测试。
    when: 上一阶段执行成功
    onFailure: 等待人工处理
    mcp:
      - git
    skills:
      - 代码审查
  - id: create-pr
    name: 创建 PR
    type: create-pr
    agent: codex
    prompt: 生成拉取请求摘要和验证说明。
    when: 上一阶段执行成功
    onFailure: 停止后续阶段
    mcp:
      - github
    skills:
      - PR 描述生成`,
  },
  {
    id: "minimal",
    name: "最小流程",
    source: "built-in",
    isDefault: false,
    yaml: `name: 最小流程
description: 只执行应用变更阶段
version: 1
stages:
  - id: apply
    name: 应用变更
    type: apply
    agent: codex
    prompt: 按照已确认的 proposal 任务实施代码变更。
    when: proposal 状态为“准备执行”
    onFailure: 停止后续阶段
    mcp:
      - 文件系统
    skills:
      - openspec-apply-change`,
  },
  {
    id: "custom-1",
    name: "我的自定义流程",
    source: "custom",
    isDefault: false,
    yaml: `name: 我的自定义流程
description: 执行变更、安全检查，并创建拉取请求
version: 1
stages:
  - id: apply
    name: 应用变更
    type: apply
    agent: codex
    prompt: 按照已确认的 proposal 任务实施代码变更。
    when: proposal 状态为“准备执行”
    onFailure: 停止后续阶段
    mcp:
      - 文件系统
    skills:
      - openspec-apply-change
  - id: security-check
    name: 安全检查
    type: security-check
    agent: codex
    prompt: 检查变更文件中是否存在密钥泄露、不安全的 shell 调用或高风险 IPC 暴露。
    when: 上一阶段执行成功
    onFailure: 等待人工处理
    mcp:
      - git
    skills:
      - 安全审查
  - id: create-pr
    name: 创建 PR
    type: create-pr
    agent: codex
    prompt: 生成拉取请求摘要和验证说明。
    when: 上一阶段执行成功
    onFailure: 停止后续阶段
    mcp:
      - github
    skills:
      - PR 描述生成`,
  },
]);

const selectedTemplate = computed(
  () => templates.value.find((template) => template.id === selectedTemplateId.value) ?? null
);

const builtInTemplates = computed(() =>
  templates.value.filter((template) => template.source === "built-in")
);

const customTemplates = computed(() =>
  templates.value.filter((template) => template.source === "custom")
);

const parsedWorkflow = computed(() => parseWorkflowYaml(yamlContent.value));

const yamlLineCount = computed(() => yamlContent.value.split("\n").length);

function selectTemplate(id: string): void {
  selectedTemplateId.value = id;
  currentView.value = "template-editor";
  yamlContent.value = selectedTemplate.value?.yaml ?? "";
}

function createTemplate(): void {
  selectedTemplateId.value = null;
  currentView.value = "template-editor";
  yamlContent.value = `name: 新工作流
description: 描述这个工作流适用于什么执行场景
version: 1
stages:
  - id: apply
    name: 应用变更
    type: apply
    agent: codex
    prompt: 按照已确认的 proposal 任务实施代码变更。
    when: proposal 状态为“准备执行”
    onFailure: 停止后续阶段
    mcp:
      - 文件系统
    skills:
      - openspec-apply-change`;
}

function parseWorkflowYaml(source: string): ParsedWorkflow {
  return {
    name: readScalar(source, "name") || "未命名工作流",
    description: readScalar(source, "description") || "暂无描述",
    version: readScalar(source, "version") || "1",
    stages: readStages(source),
  };
}

function readScalar(source: string, key: string): string {
  const match = source.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function readStages(source: string): ParsedStage[] {
  const lines = source.split("\n");
  const stages: ParsedStage[] = [];
  let current: ParsedStage | null = null;
  let activeList: "mcp" | "skills" | null = null;

  for (const line of lines) {
    const stageMatch = line.match(/^ {2}- id:\s*(.+)$/);

    if (stageMatch) {
      if (current) {
        stages.push(current);
      }

      current = createEmptyStage(stageMatch[1]);
      activeList = null;
      continue;
    }

    if (!current) {
      continue;
    }

    const propertyMatch = line.match(/^ {4}([A-Za-z][\w-]*):\s*(.*)$/);
    if (propertyMatch) {
      const [, key, rawValue] = propertyMatch;
      const value = rawValue.trim();
      activeList = null;

      if (key === "mcp" || key === "skills") {
        activeList = key;
        continue;
      }

      if (key in current) {
        current[key as keyof Omit<ParsedStage, "mcp" | "skills">] = value;
      }

      continue;
    }

    const listItemMatch = line.match(/^ {6}-\s*(.+)$/);
    if (listItemMatch && activeList) {
      current[activeList].push(listItemMatch[1].trim());
    }
  }

  if (current) {
    stages.push(current);
  }

  return stages;
}

function createEmptyStage(id: string): ParsedStage {
  return {
    id: id.trim(),
    name: id.trim(),
    type: "未识别",
    agent: "codex",
    prompt: "",
    when: "始终执行",
    onFailure: "停止后续阶段",
    mcp: [],
    skills: [],
  };
}

function stageColor(type: string): StageBadgeColor {
  const colorMap: Record<string, StageBadgeColor> = {
    apply: "primary",
    "code-review": "info",
    "security-check": "warning",
    "create-pr": "success",
  };

  return colorMap[type] ?? "neutral";
}
</script>

<template>
  <div class="flex flex-1 overflow-hidden">
    <aside class="w-65 shrink-0 border-r border-default bg-default flex flex-col">
      <div class="px-3 py-3 border-b border-default shrink-0">
        <UButton
          variant="outline"
          color="neutral"
          size="sm"
          icon="i-lucide-plus"
          label="新建模板"
          class="w-full justify-start"
          @click="createTemplate"
        />
      </div>

      <div class="flex-1 overflow-y-auto py-2">
        <div>
          <p class="px-3 py-1 text-xs font-medium text-muted">内置</p>
          <button
            v-for="template in builtInTemplates"
            :key="template.id"
            type="button"
            class="mx-2 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-accented transition-colors w-[calc(100%-1rem)] text-left"
            :class="selectedTemplateId === template.id ? 'bg-accented' : 'bg-transparent'"
            @click="selectTemplate(template.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="text-sm font-medium text-highlighted">{{ template.name }}</span>
              <UBadge v-if="template.isDefault" color="primary" variant="soft" size="xs">
                默认
              </UBadge>
            </div>
            <p class="text-xs text-muted mt-0.5">
              {{
                parseWorkflowYaml(template.yaml)
                  .stages.map((stage) => stage.name)
                  .join(" → ")
              }}
            </p>
          </button>
        </div>

        <div class="mt-2">
          <p class="px-3 py-1 text-xs font-medium text-muted">自定义</p>
          <button
            v-for="template in customTemplates"
            :key="template.id"
            type="button"
            class="mx-2 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-accented transition-colors w-[calc(100%-1rem)] text-left"
            :class="selectedTemplateId === template.id ? 'bg-accented' : 'bg-transparent'"
            @click="selectTemplate(template.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="text-sm font-medium text-highlighted">{{ template.name }}</span>
            </div>
            <p class="text-xs text-muted mt-0.5">
              {{
                parseWorkflowYaml(template.yaml)
                  .stages.map((stage) => stage.name)
                  .join(" → ")
              }}
            </p>
          </button>
        </div>
      </div>
    </aside>

    <main class="flex-1 min-w-0 flex flex-col bg-default">
      <div v-if="currentView === 'empty'" class="flex flex-1 items-center justify-center h-full">
        <div class="flex flex-col items-center text-center">
          <UIcon name="i-lucide-workflow" class="w-10 h-10 text-muted" />
          <p class="text-sm font-medium text-highlighted mt-3">选择或新建工作流模板</p>
          <p class="text-xs text-muted mt-1">编辑 YAML，并从 YAML 渲染工作流预览</p>
        </div>
      </div>

      <div v-else class="flex flex-col flex-1 overflow-hidden">
        <div
          v-if="selectedTemplate?.source === 'built-in'"
          class="flex items-center gap-2 px-6 py-2 bg-info/10 border-b border-info/20 text-xs text-info shrink-0"
        >
          <UIcon name="i-lucide-info" class="w-3.5 h-3.5 shrink-0" />
          <span>内置模板不可直接编辑，保存时将创建自定义副本</span>
        </div>

        <div
          class="flex items-center justify-between gap-4 px-6 py-4 border-b border-default shrink-0"
        >
          <div class="min-w-0">
            <h1 class="text-lg font-semibold text-highlighted truncate">
              {{ parsedWorkflow.name }}
            </h1>
            <p class="text-xs text-muted mt-1 truncate">
              {{ parsedWorkflow.description }}
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <UBadge color="neutral" variant="soft">v{{ parsedWorkflow.version }}</UBadge>
            <UBadge v-if="selectedTemplate?.source === 'built-in'" color="neutral" variant="soft">
              内置
            </UBadge>
            <UBadge v-else color="primary" variant="soft">自定义</UBadge>
            <UButton variant="ghost" color="neutral" size="sm" label="取消" />
            <UButton
              color="primary"
              size="sm"
              :label="selectedTemplate?.source === 'built-in' ? '复制并保存' : '保存 YAML'"
            />
          </div>
        </div>

        <div class="flex flex-1 min-h-0 overflow-hidden">
          <section class="flex-1 min-w-0 overflow-y-auto px-6 py-4">
            <div class="flex items-center justify-between gap-3 mb-3">
              <p class="text-xs font-medium text-muted">从 YAML 渲染的阶段预览</p>
              <UBadge color="neutral" variant="soft" size="xs">
                {{ parsedWorkflow.stages.length }} 个阶段
              </UBadge>
            </div>

            <div v-if="parsedWorkflow.stages.length === 0" class="text-sm text-muted py-8">
              YAML 中尚未定义阶段。
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="(stage, index) in parsedWorkflow.stages"
                :key="`${stage.id}-${index}`"
                class="rounded-lg border border-default bg-elevated px-4 py-3"
              >
                <div class="flex items-start gap-3">
                  <UBadge variant="soft" color="neutral" size="xs" class="mt-0.5">
                    {{ index + 1 }}
                  </UBadge>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 min-w-0">
                      <h2 class="text-sm font-medium text-highlighted truncate">
                        {{ stage.name }}
                      </h2>
                      <UBadge :color="stageColor(stage.type)" size="xs">
                        {{ stage.type }}
                      </UBadge>
                    </div>

                    <div class="grid grid-cols-2 gap-x-5 gap-y-2 mt-3 text-xs">
                      <div>
                        <p class="text-muted">id</p>
                        <p class="text-highlighted font-mono mt-0.5">{{ stage.id }}</p>
                      </div>
                      <div>
                        <p class="text-muted">agent</p>
                        <p class="text-highlighted font-mono mt-0.5">{{ stage.agent }}</p>
                      </div>
                      <div>
                        <p class="text-muted">when</p>
                        <p class="text-highlighted font-mono mt-0.5">{{ stage.when }}</p>
                      </div>
                      <div>
                        <p class="text-muted">onFailure</p>
                        <p class="text-highlighted font-mono mt-0.5">{{ stage.onFailure }}</p>
                      </div>
                    </div>

                    <div class="mt-3">
                      <p class="text-xs text-muted">prompt</p>
                      <p class="text-xs text-highlighted mt-1 leading-5">
                        {{ stage.prompt || "未配置" }}
                      </p>
                    </div>

                    <div class="flex flex-wrap gap-2 mt-3">
                      <UBadge
                        v-for="item in stage.mcp"
                        :key="`mcp-${stage.id}-${item}`"
                        color="neutral"
                        variant="soft"
                        size="xs"
                      >
                        MCP：{{ item }}
                      </UBadge>
                      <UBadge
                        v-for="item in stage.skills"
                        :key="`skill-${stage.id}-${item}`"
                        color="primary"
                        variant="soft"
                        size="xs"
                      >
                        Skill：{{ item }}
                      </UBadge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="w-[45%] min-w-100 border-l border-default flex flex-col bg-default">
            <div class="px-6 py-3 border-b border-default shrink-0">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-medium text-muted">YAML 源数据</p>
                  <p class="text-xs text-muted mt-1">{{ yamlLineCount }} 行</p>
                </div>
                <UBadge color="primary" variant="soft" size="xs">唯一数据源</UBadge>
              </div>
            </div>

            <div class="flex-1 min-h-0 p-4">
              <UTextarea
                v-model="yamlContent"
                :rows="24"
                class="font-mono text-xs w-full h-full"
                placeholder="# YAML 格式的工作流模板配置"
                :disabled="selectedTemplate?.source === 'built-in'"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>
