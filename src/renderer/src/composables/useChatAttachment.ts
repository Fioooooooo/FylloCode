import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { useToast } from "@nuxt/ui/composables";
import { chatApi } from "@renderer/api/session/chat";
import { useProjectStore, useSessionStore } from "@renderer/stores";
import {
  createChatPromptAttachment,
  revokeChatPromptAttachmentPreview,
  type ChatPromptAttachment,
} from "@renderer/utils/chat-prompt-attachment";
import type { AcpPromptCapabilities } from "@shared/types/acp-agent";
import type { ChatPromptPart } from "@shared/types/chat-prompt";

/**
 * Manage user-selected file attachments for the chat prompt.
 *
 * Responsibilities:
 * - Read selected files as base64 data URLs.
 * - Ensure a session exists (creating a draft session if needed) before persisting.
 * - Persist attachments through the chat IPC API and produce prompt parts that respect
 *   the current agent's capabilities (image vs. embedded context / resource_link).
 */
export function useChatAttachment(promptCapabilities: Readonly<Ref<AcpPromptCapabilities>>): {
  attachments: Ref<ChatPromptAttachment[]>;
  hasPendingAttachments: ComputedRef<boolean>;
  attachmentParts: ComputedRef<ChatPromptPart[]>;
  handleAttachmentSelect: (files: File[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
} {
  const projectStore = useProjectStore();
  const sessionStore = useSessionStore();
  const toast = useToast();
  const { activeSession, draftAgentId } = storeToRefs(sessionStore);
  const attachments = ref<ChatPromptAttachment[]>([]);
  const savingAttachmentCount = ref(0);
  const isSavingAttachments = computed(() => savingAttachmentCount.value > 0);
  const hasPendingAttachments = computed(
    () => isSavingAttachments.value || attachments.value.some((attachment) => !attachment.uri)
  );
  // 根据当前 agent 的能力决定附件类型：图片走 image part，其他文件走 resource_link；
  // 若 agent 不支持对应能力则静默跳过该附件。
  const attachmentParts = computed<ChatPromptPart[]>(() => {
    const parts: ChatPromptPart[] = [];
    for (const attachment of attachments.value) {
      if (!attachment.uri) {
        continue;
      }

      if (attachment.mediaType.startsWith("image/")) {
        if (!promptCapabilities.value.image) {
          continue;
        }

        parts.push({
          type: "image",
          mediaType: attachment.mediaType,
          uri: attachment.uri,
          filename: attachment.name,
        });
        continue;
      }

      if (!promptCapabilities.value.embeddedContext) {
        continue;
      }

      parts.push({
        type: "resource_link",
        mediaType: attachment.mediaType,
        uri: attachment.uri,
        filename: attachment.name,
      });
    }
    return parts;
  });
  let attachmentId = 0;

  async function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        resolve(result.split(",").at(1) ?? "");
      };
      reader.readAsDataURL(file);
    });
  }

  async function ensureAttachmentSession(): Promise<{
    projectId: string;
    sessionId: string;
  } | null> {
    const active = activeSession.value;
    const projectId = projectStore.currentProject?.id ?? active?.projectId;
    if (!projectId) {
      toast.add({ title: "请先打开项目", color: "warning" });
      return null;
    }
    if (active) {
      return { projectId, sessionId: active.id };
    }

    // No active session yet: create a draft session so the attachment has somewhere to live.
    const agentId = draftAgentId.value;
    if (!agentId) {
      toast.add({
        title: "暂无可用 Agent",
        description: "请先安装 Agent 后再上传附件",
        color: "error",
      });
      return null;
    }

    const createdSession = await sessionStore.createSession({
      projectId,
      agentId,
      title: "New Session",
    });
    return { projectId, sessionId: createdSession.id };
  }

  async function persistAttachment(file: File, attachment: ChatPromptAttachment): Promise<void> {
    savingAttachmentCount.value += 1;
    try {
      const target = await ensureAttachmentSession();
      if (!target) {
        throw new Error("Cannot save attachment without a session");
      }

      const base64Data = await readFileAsBase64(file);
      const response = await chatApi.saveAttachment(
        target.projectId,
        target.sessionId,
        file.name,
        attachment.mediaType,
        base64Data
      );
      if (!response.ok) {
        throw new Error(response.error.message);
      }

      attachment.uri = response.data.uri;
      attachment.mediaType = response.data.mimeType;
    } catch (error: unknown) {
      removeAttachment(attachment.id);
      toast.add({
        title: "附件保存失败",
        description: error instanceof Error ? error.message : String(error),
        color: "error",
      });
    } finally {
      savingAttachmentCount.value -= 1;
    }
  }

  function clearAttachments(): void {
    const sentAttachments = attachments.value;
    attachments.value = [];
    sentAttachments.forEach(revokeChatPromptAttachmentPreview);
  }

  function handleAttachmentSelect(files: File[]): void {
    if (files.length === 0) {
      return;
    }

    const nextAttachments = files.map((file) =>
      createChatPromptAttachment(file, `attachment-${attachmentId++}`)
    );
    attachments.value = [...attachments.value, ...nextAttachments];
    nextAttachments.forEach((attachment, index) => {
      const file = files[index];
      if (file) {
        void persistAttachment(file, attachment);
      }
    });
  }

  function removeAttachment(id: string): void {
    const index = attachments.value.findIndex((attachment) => attachment.id === id);

    if (index < 0) {
      return;
    }

    const [removedAttachment] = attachments.value.splice(index, 1);

    if (removedAttachment) {
      revokeChatPromptAttachmentPreview(removedAttachment);
    }
  }

  onBeforeUnmount(() => {
    attachments.value.forEach(revokeChatPromptAttachmentPreview);
  });

  return {
    attachments,
    hasPendingAttachments,
    attachmentParts,
    handleAttachmentSelect,
    removeAttachment,
    clearAttachments,
  };
}
