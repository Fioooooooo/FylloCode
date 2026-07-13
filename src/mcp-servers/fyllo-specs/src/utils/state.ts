export function wrapState(skillPrompt: string, state: unknown): string {
  return `<tool_instruction>\n${skillPrompt}\n</tool_instruction>\n\n<state>\n${JSON.stringify(state, null, 2)}\n</state>`;
}

export interface ErrorEntry {
  type: string;
  message: string;
}

export interface RunToolOptions {
  includeInstruction?: boolean;
}

// 统一包装 tool 返回：正常状态下返回 tool_instruction + state；错误时返回带 errors 的 state，
// 保证 LLM 始终拿到可解析的结构而不是抛错。
export async function runTool(
  promptId: string,
  options: RunToolOptions,
  build: () => Promise<object>
): Promise<string> {
  const { includeInstruction = true } = options;
  const { loadPrompt } = await import("./load-prompt");
  const skillPrompt = loadPrompt(promptId as import("./load-prompt").PromptId);
  try {
    const state = await build();
    if (includeInstruction) {
      return wrapState(skillPrompt, state);
    }
    return JSON.stringify(state, null, 2);
  } catch (err) {
    const errorEntry: ErrorEntry = {
      type: err instanceof Error ? err.name : "UnknownError",
      message: err instanceof Error ? err.message : String(err),
    };
    const errorState = { errors: [errorEntry] };
    if (includeInstruction) {
      return wrapState(skillPrompt, errorState);
    }
    return JSON.stringify(errorState, null, 2);
  }
}
