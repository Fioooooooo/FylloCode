import type { UIMessage } from "ai";
import { onUnmounted, reactive, watch } from "vue";
import { chatApi } from "@renderer/api/chat";
import { getFilePartUrl, isUserImagePart } from "@renderer/utils/chat-message-parts";

type MessagePart = UIMessage["parts"][number];

function getFilePartMediaType(part: MessagePart): string {
  const value = (part as { mediaType?: unknown }).mediaType;
  return typeof value === "string" ? value : "";
}

export function useUserImagePart(options: {
  messageId: () => string;
  parts: () => MessagePart[];
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

  async function resolveImagePartSrc(key: string, url: string, mediaType: string): Promise<void> {
    try {
      const response = await chatApi.readAttachmentDataUrl(url, mediaType);
      if (isDisposed || imageRequestUrlByPartKey[key] !== url || !response.ok) {
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
        const url = getFilePartUrl(part);
        activeKeys.add(key);

        if (imageRequestUrlByPartKey[key] === url) {
          return;
        }

        imageRequestUrlByPartKey[key] = url;

        if (!url) {
          imageSrcByPartKey[key] = "";
          return;
        }

        if (!url.startsWith("file://")) {
          imageSrcByPartKey[key] = url;
          return;
        }

        imageSrcByPartKey[key] = "";
        void resolveImagePartSrc(key, url, getFilePartMediaType(part));
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
