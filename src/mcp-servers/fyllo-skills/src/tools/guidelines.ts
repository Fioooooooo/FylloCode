import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GuidelineEntry } from "../types";
import { loadPrompt } from "../utils/load-prompt";
import { scanGuidelines } from "../utils/scan-guidelines";

const guidelinesInputSchema = z.object({ mode: z.enum(["read", "write"]) }).strict();

type GuidelinesInput = z.infer<typeof guidelinesInputSchema>;
type GuidelinesResponse = { content: [{ type: "text"; text: string }] };

function buildWriteResponse(): string {
  return `<tool_instruction>\n${loadPrompt("guidelines")}\n</tool_instruction>`;
}

async function buildReadResponse(): Promise<string> {
  const guidelines: GuidelineEntry[] = await scanGuidelines(process.cwd());
  return JSON.stringify({ guidelines }, null, 2);
}

export async function handleGuidelines(input: GuidelinesInput): Promise<GuidelinesResponse> {
  const text = input.mode === "write" ? buildWriteResponse() : await buildReadResponse();
  return { content: [{ type: "text", text }] };
}

export function registerGuidelinesTool(server: McpServer): void {
  server.registerTool(
    "guidelines",
    {
      description:
        "Read or maintain project repository guidelines. mode=read discovers existing guideline files and returns each file's name, description, and keywords so you can decide whether to Read the full document. mode=write returns the authoring contract for creating or updating guidelines/*.md.",
      inputSchema: guidelinesInputSchema,
    },
    handleGuidelines
  );
}
