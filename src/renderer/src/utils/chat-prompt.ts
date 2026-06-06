export type CommandTriggerSource = "button" | "slash";

export function isCursorAtLineStart(text: string, cursor: number): boolean {
  const prefix = text.slice(0, cursor);
  const linePrefix = prefix.includes("\n") ? prefix.slice(prefix.lastIndexOf("\n") + 1) : prefix;
  return /^[ \t]*$/.test(linePrefix);
}

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
