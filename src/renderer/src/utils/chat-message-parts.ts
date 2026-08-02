import type { UIMessage } from "ai";

type MessagePart = UIMessage["parts"][number];

export function getFilePartUrl(part: MessagePart): string {
  const value = (part as { url?: unknown }).url;
  return typeof value === "string" ? value : "";
}

export function getAttachmentPartId(part: MessagePart): string {
  const value = (part as { attachmentId?: unknown }).attachmentId;
  return typeof value === "string" ? value : "";
}

export function isUserImagePart(part: MessagePart): boolean {
  const mediaType = (part as { mediaType?: unknown }).mediaType;
  return (
    (part.type === "file" || (part as { type: string }).type === "attachment") &&
    typeof mediaType === "string" &&
    mediaType.startsWith("image/")
  );
}

export function isUserFilePart(part: MessagePart): boolean {
  const mediaType = (part as { mediaType?: unknown }).mediaType;
  return (
    (part.type === "file" || (part as { type: string }).type === "attachment") &&
    typeof mediaType === "string" &&
    !mediaType.startsWith("image/")
  );
}
