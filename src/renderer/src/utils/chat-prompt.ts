export type CommandTriggerSource = "button" | "slash";

export function isCursorAtLineStart(text: string, cursor: number): boolean {
  const prefix = text.slice(0, cursor);
  const linePrefix = prefix.includes("\n") ? prefix.slice(prefix.lastIndexOf("\n") + 1) : prefix;
  return /^[ \t]*$/.test(linePrefix);
}

// 将命令名插入输入框：slash 触发时替换已有的"/"前缀；按钮触发时在光标处插入，
// 必要时前置空格以避免与已有文本粘连。
export function applyCommandSelection(options: {
  currentValue: string;
  selectionStart: number;
  selectionEnd: number;
  commandName: string;
  triggerSource: CommandTriggerSource;
}): { value: string; cursor: number } {
  const { currentValue, selectionStart, selectionEnd, commandName, triggerSource } = options;
  const replacement = `/${commandName} `;

  if (triggerSource === "slash") {
    const slashIndex = currentValue.slice(0, selectionStart).lastIndexOf("/");
    if (slashIndex >= 0) {
      return {
        value: currentValue.slice(0, slashIndex) + replacement + currentValue.slice(selectionEnd),
        cursor: slashIndex + replacement.length,
      };
    }
    return {
      value: currentValue.slice(0, selectionStart) + replacement + currentValue.slice(selectionEnd),
      cursor: selectionStart + replacement.length,
    };
  }

  const prefix = currentValue.slice(0, selectionStart);
  const suffix = currentValue.slice(selectionEnd);
  const needsLeadingSpace = prefix.length > 0 && /\S$/.test(prefix);
  const insertion = `${needsLeadingSpace ? " " : ""}${replacement}`;

  return {
    value: prefix + insertion + suffix,
    cursor: prefix.length + insertion.length,
  };
}
