import logger from "@main/infra/logger";
import {
  getYunxiaoOrganizationId,
  getYunxiaoUserId,
} from "@main/infra/storage/yunxiao-credentials";
import { loadProjectIntegrationConfig } from "@main/infra/storage/project-integration-store";
import {
  getWorkitem,
  searchWorkitems,
  type SearchWorkitemsParams,
  type Workitem,
} from "@main/infra/integration/yunxiao/projex";
import type { TaskDescription, TaskItem, TaskLabel, YunxiaoTaskMeta } from "@shared/types/task";
import type { ProjectIntegrationEntry } from "@shared/types/integration";
import type { TaskAdapter } from "./task-adapter";

type YunxiaoCategory = "Req" | "Task" | "Bug";
type YunxiaoIssueType = NonNullable<YunxiaoTaskMeta["issueType"]>;

interface SearchCondition {
  fieldIdentifier: string;
  operator: "CONTAINS";
  value: string[];
  toValue: null;
  className: "status" | "user";
  format: "list";
}

const PROJECT_MANAGEMENT_STAGE = "project-management";
const SPACE_TYPE = "Project";
const ORDER_BY = "gmtCreate";
const SORT = "desc";
const PAGE = 1;
const PER_PAGE = 20;
const WORKITEM_URL_PREFIX = "https://devops.aliyun.com/projex/project";

const STATUS_IDS_BY_CATEGORY: Record<YunxiaoCategory, string[]> = {
  Req: [
    "100005",
    "625489",
    "154395",
    "165115",
    "100010",
    "156603",
    "307012",
    "100011",
    "142838",
    "100012",
    "100013",
    "92f8892614756eb5551309e826",
    "bc9040b0df1bbe9dc7a335b75a",
  ],
  Task: ["100005", "100010"],
  Bug: ["28", "30", "100010"],
};

const ISSUE_TYPE_BY_CATEGORY: Record<YunxiaoCategory, YunxiaoIssueType> = {
  Req: "需求",
  Task: "任务",
  Bug: "缺陷",
};

function parseYunxiaoTaskId(taskId: string): { spaceId: string; workitemId: string } | null {
  const parts = taskId.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [namespace, spaceId, workitemId] = parts;
  if (namespace !== "yunxiao" || !spaceId || !workitemId) {
    return null;
  }

  return { spaceId, workitemId };
}

export function buildWorkitemUrl(
  category: YunxiaoCategory,
  workitem: Pick<Workitem, "id" | "space">
): string {
  const path = category === "Req" ? "req" : category === "Task" ? "task" : "bug";
  return `${WORKITEM_URL_PREFIX}/${workitem.space.id}/${path}/${workitem.id}`;
}

function buildConditions(category: YunxiaoCategory, yunxiaoUserId: string): string {
  const conditions: SearchCondition[] = [
    {
      fieldIdentifier: "status",
      operator: "CONTAINS",
      value: STATUS_IDS_BY_CATEGORY[category],
      toValue: null,
      className: "status",
      format: "list",
    },
    {
      fieldIdentifier: "assignedTo",
      operator: "CONTAINS",
      value: [yunxiaoUserId],
      toValue: null,
      className: "user",
      format: "list",
    },
  ];

  return JSON.stringify({ conditionGroups: [conditions] });
}

export function buildSearchWorkitemsParams(
  spaceId: string,
  category: YunxiaoCategory,
  organizationId: string,
  yunxiaoUserId: string
): SearchWorkitemsParams {
  return {
    organizationId,
    spaceId,
    category,
    conditions: buildConditions(category, yunxiaoUserId),
    spaceType: SPACE_TYPE,
    orderBy: ORDER_BY,
    sort: SORT,
    page: PAGE,
    perPage: PER_PAGE,
  };
}

function getMountedYunxiaoSpaces(projectId: string): string[] {
  const config = loadProjectIntegrationConfig(projectId);
  const entries = config[PROJECT_MANAGEMENT_STAGE] ?? [];
  return entries
    .filter(isMountedYunxiaoProjexProject)
    .map((entry) => entry.resourceId)
    .filter((spaceId, index, list) => list.indexOf(spaceId) === index);
}

function isMountedYunxiaoProjexProject(entry: ProjectIntegrationEntry): boolean {
  return entry.providerId === "yunxiao" && entry.resourceType === "projex-project";
}

function resolveUpdatedAt(workitem: Workitem, createdAt: Date): Date {
  if (workitem.gmtModified) {
    return new Date(workitem.gmtModified);
  }

  if (workitem.updateStatusAt) {
    return new Date(workitem.updateStatusAt);
  }

  return createdAt;
}

function buildLabels(workitem: Workitem, issueType: YunxiaoIssueType): TaskLabel[] {
  return [
    {
      id: `${workitem.space.id}:space`,
      name: workitem.space.name,
    },
    {
      id: `${workitem.id}:issue-type`,
      name: issueType,
    },
    {
      id: `${workitem.status.id}:status`,
      name: workitem.status.displayName,
    },
  ];
}

function resolveCategory(workitem: Workitem): YunxiaoCategory {
  if (
    workitem.categoryId === "Req" ||
    workitem.categoryId === "Task" ||
    workitem.categoryId === "Bug"
  ) {
    return workitem.categoryId;
  }

  if (
    workitem.category?.id === "Req" ||
    workitem.category?.id === "Task" ||
    workitem.category?.id === "Bug"
  ) {
    return workitem.category.id;
  }

  const workitemTypeName = workitem.workitemType?.name?.toLowerCase?.() ?? "";
  if (workitemTypeName.includes("bug") || workitem.workitemType?.name === "缺陷") {
    return "Bug";
  }
  if (workitemTypeName.includes("req") || workitem.workitemType?.name === "需求") {
    return "Req";
  }

  return "Task";
}

type YunxiaoRichTextPayload = {
  htmlValue?: unknown;
};

export function mapYunxiaoDescription(workitem: Workitem): TaskDescription {
  const content = workitem.description ?? "";

  if (workitem.formatType === "MARKDOWN") {
    return {
      format: "markdown",
      content,
    };
  }

  if (workitem.formatType === "RICHTEXT") {
    try {
      const parsed = JSON.parse(content) as YunxiaoRichTextPayload;
      if (typeof parsed.htmlValue === "string") {
        return {
          format: "html",
          content: parsed.htmlValue,
        };
      }
    } catch {
      return {
        format: "plain_text",
        content,
      };
    }
  }

  return {
    format: "plain_text",
    content,
  };
}

function mapToTaskItem(
  projectId: string,
  spaceId: string,
  category: YunxiaoCategory,
  workitem: Workitem
): TaskItem {
  const issueType = ISSUE_TYPE_BY_CATEGORY[category];
  const createdAt = new Date(workitem.gmtCreate);
  const updatedAt = resolveUpdatedAt(workitem, createdAt);
  const sourceMeta: YunxiaoTaskMeta = {
    source: "yunxiao",
    url: buildWorkitemUrl(category, workitem),
    key: workitem.serialNumber,
    issueType,
  };

  const task: TaskItem = {
    id: `yunxiao:${spaceId}:${workitem.id}`,
    projectId,
    title: workitem.subject,
    description: mapYunxiaoDescription(workitem),
    status: "open",
    source: "yunxiao",
    sourceMeta,
    labels: buildLabels(workitem, issueType),
    createdAt,
    updatedAt,
  };

  if (workitem.assignedTo?.id && workitem.assignedTo.name) {
    task.assignee = {
      id: workitem.assignedTo.id,
      name: workitem.assignedTo.name,
    };
  }

  return task;
}

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}

async function searchByCategory(
  projectId: string,
  spaceId: string,
  category: YunxiaoCategory,
  organizationId: string,
  yunxiaoUserId: string
): Promise<TaskItem[]> {
  const params = buildSearchWorkitemsParams(spaceId, category, organizationId, yunxiaoUserId);
  const workitems = await searchWorkitems(params);
  return workitems.map((workitem) => mapToTaskItem(projectId, spaceId, category, workitem));
}

function logQueryFailure(
  projectId: string,
  spaceId: string,
  category: YunxiaoCategory,
  error: unknown
): void {
  logger.warn("[task][yunxiao] failed to load workitems", {
    projectId,
    spaceId,
    category,
    error: error instanceof Error ? error.message : String(error),
  });
}

export class YunxiaoTaskAdapter implements TaskAdapter {
  async list(projectId: string): Promise<TaskItem[]> {
    const spaceIds = getMountedYunxiaoSpaces(projectId);
    if (spaceIds.length === 0) {
      return [];
    }

    const yunxiaoUserId = getYunxiaoUserId();
    const organizationId = getYunxiaoOrganizationId();
    const categories: YunxiaoCategory[] = ["Req", "Task", "Bug"];

    const settled = await Promise.allSettled(
      spaceIds.flatMap((spaceId) =>
        categories.map(async (category) => {
          try {
            return {
              spaceId,
              category,
              tasks: await searchByCategory(
                projectId,
                spaceId,
                category,
                organizationId,
                yunxiaoUserId
              ),
            };
          } catch (error) {
            throw {
              projectId,
              spaceId,
              category,
              cause: error,
            };
          }
        })
      )
    );

    const tasks: TaskItem[] = [];

    for (const result of settled) {
      if (result.status === "fulfilled") {
        tasks.push(...result.value.tasks);
        continue;
      }

      const payload = result.reason as
        | { projectId?: string; spaceId?: string; category?: YunxiaoCategory; cause?: unknown }
        | undefined;

      logQueryFailure(
        payload?.projectId ?? projectId,
        payload?.spaceId ?? "unknown",
        payload?.category ?? "Task",
        payload?.cause ?? result.reason
      );
    }

    return sortTasks(tasks);
  }

  async get(taskId: string, projectId: string): Promise<TaskItem | null> {
    const parsed = parseYunxiaoTaskId(taskId);
    if (!parsed) {
      return null;
    }

    const organizationId = getYunxiaoOrganizationId();
    const workitem = await getWorkitem({
      organizationId,
      id: parsed.workitemId,
    });
    logger.info(JSON.stringify(workitem));
    const category = resolveCategory(workitem);
    return mapToTaskItem(projectId, parsed.spaceId, category, workitem);
  }
}

export const yunxiaoTaskAdapter = new YunxiaoTaskAdapter();
export { parseYunxiaoTaskId };
