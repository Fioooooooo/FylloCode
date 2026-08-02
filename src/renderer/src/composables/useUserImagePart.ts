import type { UIMessage } from "ai";
import { onUnmounted, reactive, watch } from "vue";
import { chatApi } from "@renderer/api/session/chat";
import {
  getAttachmentPartId,
  getFilePartUrl,
  isUserImagePart,
} from "@renderer/utils/chat-message-parts";

type MessagePart = UIMessage["parts"][number];

function getFilePartMediaType(part: MessagePart): string {
  const value = (part as { mediaType?: unknown }).mediaType;
  return typeof value === "string" ? value : "";
}

/**
 * Resolve user image parts into previewable data URLs.
 *
 * Caches results per message-part and resolves opaque attachment IDs through Main.
 */
export function useUserImagePart(options: {
  messageId: () => string;
  parts: () => MessagePart[];
  workspaceId: () => string | null | undefined;
  sessionId: () => string | null | undefined;
}): {
  getImageSrc: (index: number) => string;
} {
  const imageSrcByPartKey = reactive<Record<string, string>>({});
  const imageRequestUrlByPartKey = reactive<Record<string, string>>({});
  let isDisposed = false;

  onUnmounted(() => {
    isDisposed = true;
  });

  function getImagePartKey(index: number): string {
    return `${options.messageId()}-${index}`;
  }

  async function resolveImagePartSrc(
    key: string,
    attachmentId: string,
    mediaType: string
  ): Promise<void> {
    try {
      const workspaceId = options.workspaceId();
      const sessionId = options.sessionId();
      if (!workspaceId || !sessionId) return;
      const response = await chatApi.readAttachmentDataUrl(
        workspaceId,
        sessionId,
        attachmentId,
        mediaType
      );
      if (isDisposed || imageRequestUrlByPartKey[key] !== attachmentId || !response.ok) {
        return;
      }

      imageSrcByPartKey[key] = response.data.dataUrl;
    } catch {
      // Image preview failures must not affect the rest of the message.
    }
  }

  watch(
    () => [options.messageId(), options.parts()] as const,
    () => {
      const activeKeys = new Set<string>();

      options.parts().forEach((part, index) => {
        if (!isUserImagePart(part)) {
          return;
        }

        const key = getImagePartKey(index);
        const attachmentId = getAttachmentPartId(part);
        activeKeys.add(key);

        if (imageRequestUrlByPartKey[key] === attachmentId) {
          return;
        }

        imageRequestUrlByPartKey[key] = attachmentId;

        if (!attachmentId) {
          const legacyUrl = getFilePartUrl(part);
          imageSrcByPartKey[key] = legacyUrl.startsWith("file://") ? "" : legacyUrl;
          return;
        }

        imageSrcByPartKey[key] = "";
        void resolveImagePartSrc(key, attachmentId, getFilePartMediaType(part));
      });

      for (const key of Object.keys(imageSrcByPartKey)) {
        if (!activeKeys.has(key)) {
          delete imageSrcByPartKey[key];
          delete imageRequestUrlByPartKey[key];
        }
      }
    },
    { deep: true, immediate: true }
  );

  function getImageSrc(index: number): string {
    return imageSrcByPartKey[getImagePartKey(index)] ?? "";
  }

  return {
    getImageSrc,
  };
}
