import type { UIMessage } from "ai";

type MessagePart = UIMessage["parts"][number];

export function getFilePartUrl(part: MessagePart): string {
  const value = (part as { url?: unknown }).url;
  return typeof value === "string" ? value : "";
}

export function isUserImagePart(part: MessagePart): boolean {
  return (
    part.type === "file" &&
    typeof part.mediaType === "string" &&
    part.mediaType.startsWith("image/")
  );
}

export function isUserFilePart(part: MessagePart): boolean {
  return (
    part.type === "file" &&
    typeof part.mediaType === "string" &&
    !part.mediaType.startsWith("image/")
  );
}
