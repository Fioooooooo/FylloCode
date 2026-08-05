export interface ChatPromptTimelineSource {
  id: string;
  messageId: string;
  role: "user" | "other";
  visibleTextParts: readonly string[];
  attachmentSummaries: readonly string[];
}

export interface ChatPromptTimelineItem {
  id: string;
  messageId: string;
  index: number;
  label: string;
  preview: string;
}

function normalizedParts(parts: readonly string[]): string[] {
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function getPromptPreview(source: ChatPromptTimelineSource): string {
  const visibleText = normalizedParts(source.visibleTextParts).join("\n\n");
  if (visibleText.length > 0) {
    return visibleText;
  }

  return normalizedParts(source.attachmentSummaries).join("、");
}

export function collectChatPromptTimelineItems(
  sources: readonly ChatPromptTimelineSource[]
): ChatPromptTimelineItem[] {
  let userPromptIndex = 0;

  return sources.flatMap((source) => {
    if (source.role !== "user") {
      return [];
    }

    const preview = getPromptPreview(source);
    if (preview.length === 0) {
      return [];
    }

    userPromptIndex += 1;
    return [
      {
        id: source.id,
        messageId: source.messageId,
        index: userPromptIndex,
        label: String(userPromptIndex),
        preview,
      },
    ];
  });
}
