import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import path from "path";
import { z } from "zod";
import type { McpPlanEvent } from "@shared/types/mcp-event";
import { getMcpEventDir, requireProjectDataDir, requireSessionId } from "../../../shared/env";
import { runTool } from "../utils/state";

const agentSlugPattern = /^[a-z0-9][a-z0-9-]*$/;
const datePrefixedSlugPattern = /^\d{4}-\d{2}-\d{2}-/;

const createPlanInputSchema = z.strictObject({
  goal: z.string().min(1).describe("One-sentence summary of what this plan aims to achieve."),
  slug: z
    .string()
    .min(1)
    .describe(
      "Short kebab-case identifier for the plan, e.g. 'refactor-auth-flow'. Must not include a date prefix."
    ),
});

function formatLocalDate(now: Date): string {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function assertAgentSlug(slug: string): void {
  if (!agentSlugPattern.test(slug)) {
    throw new Error("slug must be a kebab-case fragment");
  }
  if (datePrefixedSlugPattern.test(slug)) {
    throw new Error("slug must not include a yyyy-MM-dd date prefix");
  }
}

function planSkeleton(input: { slug: string; goal: string; createdAt: string }): string {
  return [
    "---",
    `slug: ${input.slug}`,
    `goal: ${JSON.stringify(input.goal)}`,
    `createdAt: ${JSON.stringify(input.createdAt)}`,
    "status: draft",
    "---",
    "",
    "## 任务目标/Goal",
    "",
    "## 范围边界/Scope",
    "",
    "## 关键约束/Constraints",
    "",
    "## 方案取舍/Trade-offs",
    "",
    "## 实施步骤/Steps",
    "",
    "## 验证方式/Verification",
    "",
  ].join("\n");
}

async function writePlanEvent(input: { sessionId: string; planSlug: string }): Promise<void> {
  const eventDir = getMcpEventDir();
  if (!eventDir) {
    return;
  }

  const createdAt = new Date().toISOString();
  const fileName = `${Date.now()}-${nanoid()}.json`;
  const filePath = path.join(eventDir, fileName);
  const tempPath = path.join(eventDir, `${fileName}.${process.pid}.tmp`);
  const event: McpPlanEvent = {
    server: "fyllo-specs",
    tool: "create-plan",
    createdAt,
    sessionId: input.sessionId,
    planSlug: input.planSlug,
  };

  try {
    await fs.mkdir(eventDir, { recursive: true });
    await fs.writeFile(tempPath, JSON.stringify(event, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error: unknown) {
    await fs.unlink(tempPath).catch(() => undefined);
    console.warn("[fyllo-specs] failed to write create-plan event", error);
  }
}

export async function createPlanTool(
  input: z.input<typeof createPlanInputSchema>
): Promise<string> {
  return runTool("create-plan", { includeInstruction: true }, async () => {
    assertAgentSlug(input.slug);

    const projectDataDir = requireProjectDataDir();
    const sessionId = requireSessionId();
    const createdAt = new Date().toISOString();
    const fullSlug = `${formatLocalDate(new Date())}-${input.slug}`;
    const plansDir = path.join(projectDataDir, "sessions", sessionId, "plans");
    const planPath = path.join(plansDir, `${fullSlug}.md`);

    await fs.mkdir(plansDir, { recursive: true });
    await fs.writeFile(planPath, planSkeleton({ slug: fullSlug, goal: input.goal, createdAt }), {
      encoding: "utf8",
      flag: "wx",
    });
    await writePlanEvent({ sessionId, planSlug: fullSlug });

    return {
      planPath,
    };
  });
}

export function registerCreatePlanTool(server: McpServer): void {
  server.registerTool(
    "create-plan",
    {
      description:
        "Create a lightweight session-scoped plan for work that requires exploration or architectural trade-offs but does not change the behavior contract, such as public APIs, schemas, protocols, persistence formats, user-visible behavior, or ownership boundaries. If the work changes the contract, use create-proposal instead.",
      inputSchema: createPlanInputSchema,
    },
    async (input) => {
      return {
        content: [{ type: "text" as const, text: await createPlanTool(input) }],
      };
    }
  );
}
