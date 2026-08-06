import type { ChatSessionMode } from "@shared/types/chat";

export interface SessionModePresentation {
  label: string;
  tooltip: string;
}

const SESSION_MODE_PRESENTATIONS = {
  fyllocode: {
    label: "FylloCode",
    tooltip: "结合项目规范、规约与知识，按 FylloCode 工作流程协作并沉淀成果。",
  },
  native: {
    label: "原生",
    tooltip: "保持 Agent 默认的工作方式，不做改变。",
  },
} satisfies Record<ChatSessionMode, SessionModePresentation>;

export function getSessionModePresentation(mode: ChatSessionMode): SessionModePresentation {
  return SESSION_MODE_PRESENTATIONS[mode];
}
