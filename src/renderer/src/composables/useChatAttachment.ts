import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { useToast } from "@nuxt/ui/composables";
import { chatApi } from "@renderer/api/session/chat";
import { useWorkspaceStore, useSessionStore } from "@renderer/stores";
import {
  createChatPromptAttachment,
  revokeChatPromptAttachmentPreview,
  type ChatPromptAttachment,
} from "@renderer/utils/chat-prompt-attachment";
import type { AcpPromptCapabilities } from "@shared/types/acp-agent";
import type { ChatPromptPart } from "@shared/types/chat-prompt";

export interface ChatAttachmentTarget {
  workspaceId: string;
  sessionId: string;
}

/**
 * Manage user-selected file attachments for the chat prompt.
 *
 * Responsibilities:
 * - Read selected files as base64 data URLs.
 * - Keep draft attachments local until the first real session has been created.
 * - Persist attachments through the chat IPC API and produce prompt parts that respect
 *   the current agent's capabilities (image vs. embedded context / resource_link).
 */
export function useChatAttachment(promptCapabilities: Readonly<Ref<AcpPromptCapabilities>>): {
  attachments: Ref<ChatPromptAttachment[]>;
  hasPendingAttachments: ComputedRef<boolean>;
  attachmentParts: ComputedRef<ChatPromptPart[]>;
  materializeAttachmentParts: (target: ChatAttachmentTarget) => Promise<ChatPromptPart[]>;
  handleAttachmentSelect: (files: File[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
} {
  const workspaceStore = useWorkspaceStore();
  const sessionStore = useSessionStore();
  const toast = useToast();
  const { activeSession, draftAgentId } = storeToRefs(sessionStore);
  const attachments = ref<ChatPromptAttachment[]>([]);
  const savingAttachmentCount = ref(0);
  const isSavingAttachments = computed(() => savingAttachmentCount.value > 0);
  const hasPendingAttachments = computed(() => isSavingAttachments.value);
  const fileByAttachmentId = new Map<string, File>();
  const targetByAttachmentId = new Map<string, ChatAttachmentTarget>();
  // 附件始终以 opaque attachment part 表达；capability 只决定是否允许发送。
  const attachmentParts = computed<ChatPromptPart[]>(() => {
    const parts: ChatPromptPart[] = [];
    for (const attachment of attachments.value) {
      if (!attachment.attachmentId) {
        continue;
      }

      if (attachment.mediaType.startsWith("image/")) {
        if (!promptCapabilities.value.image) {
          continue;
        }
      } else if (!promptCapabilities.value.embeddedContext) {
        continue;
      }

      parts.push({
        type: "attachment",
        attachmentId: attachment.attachmentId,
        mediaType: attachment.mediaType,
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

  function targetsMatch(
    left: ChatAttachmentTarget | undefined,
    right: ChatAttachmentTarget
  ): boolean {
    return left?.workspaceId === right.workspaceId && left.sessionId === right.sessionId;
  }

  async function saveAttachmentToTarget(
    file: File,
    attachment: ChatPromptAttachment,
    target: ChatAttachmentTarget
  ): Promise<void> {
    savingAttachmentCount.value += 1;
    try {
      const base64Data = await readFileAsBase64(file);
      const response = await chatApi.saveAttachment(
        target.workspaceId,
        target.sessionId,
        file.name,
        attachment.mediaType,
        base64Data
      );
      if (!response.ok) {
        throw new Error(response.error.message);
      }

      attachment.attachmentId = response.data.attachmentId;
      attachment.mediaType = response.data.mimeType;
      targetByAttachmentId.set(attachment.id, target);
    } finally {
      savingAttachmentCount.value -= 1;
    }
  }

  async function persistSelectedAttachment(
    file: File,
    attachment: ChatPromptAttachment,
    target: ChatAttachmentTarget
  ): Promise<void> {
    try {
      await saveAttachmentToTarget(file, attachment, target);
    } catch (error: unknown) {
      removeAttachment(attachment.id);
      toast.add({
        title: "附件保存失败",
        description: error instanceof Error ? error.message : String(error),
        color: "error",
      });
    }
  }

  async function materializeAttachmentParts(
    target: ChatAttachmentTarget
  ): Promise<ChatPromptPart[]> {
    for (const attachment of attachments.value) {
      if (
        attachment.attachmentId &&
        !targetsMatch(targetByAttachmentId.get(attachment.id), target)
      ) {
        attachment.attachmentId = null;
        targetByAttachmentId.delete(attachment.id);
      }
    }

    const pendingAttachments = attachments.value.filter((attachment) => !attachment.attachmentId);
    const results = await Promise.allSettled(
      pendingAttachments.map(async (attachment) => {
        const file = fileByAttachmentId.get(attachment.id);
        if (!file) {
          throw new Error(`Attachment source is unavailable: ${attachment.name}`);
        }
        await saveAttachmentToTarget(file, attachment, target);
      })
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (failure) {
      for (const attachment of pendingAttachments) {
        attachment.attachmentId = null;
        targetByAttachmentId.delete(attachment.id);
      }
      throw failure.reason;
    }

    return attachmentParts.value;
  }

  function clearAttachments(): void {
    const sentAttachments = attachments.value;
    attachments.value = [];
    fileByAttachmentId.clear();
    targetByAttachmentId.clear();
    sentAttachments.forEach(revokeChatPromptAttachmentPreview);
  }

  function handleAttachmentSelect(files: File[]): void {
    if (files.length === 0) {
      return;
    }

    const nextAttachments = files.map((file) =>
      createChatPromptAttachment(file, `attachment-${attachmentId++}`)
    );
    nextAttachments.forEach((attachment, index) => {
      const file = files[index];
      if (file) {
        fileByAttachmentId.set(attachment.id, file);
      }
    });
    attachments.value = [...attachments.value, ...nextAttachments];

    const active = activeSession.value;
    const workspaceId = workspaceStore.currentWorkspace?.id ?? active?.workspaceId;
    if (!active) {
      if (!draftAgentId.value) {
        toast.add({
          title: "暂无可用 Agent",
          description: "请先安装 Agent 后再上传附件",
          color: "error",
        });
      }
      return;
    }
    if (!workspaceId) {
      toast.add({ title: "请先打开项目", color: "warning" });
      return;
    }

    const target = { workspaceId, sessionId: active.id };
    nextAttachments.forEach((attachment, index) => {
      const file = files[index];
      if (file) {
        void persistSelectedAttachment(file, attachment, target);
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
      fileByAttachmentId.delete(removedAttachment.id);
      targetByAttachmentId.delete(removedAttachment.id);
      revokeChatPromptAttachmentPreview(removedAttachment);
    }
  }

  onBeforeUnmount(() => {
    attachments.value.forEach(revokeChatPromptAttachmentPreview);
    fileByAttachmentId.clear();
    targetByAttachmentId.clear();
  });

  return {
    attachments,
    hasPendingAttachments,
    attachmentParts,
    materializeAttachmentParts,
    handleAttachmentSelect,
    removeAttachment,
    clearAttachments,
  };
}
