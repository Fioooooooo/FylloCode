export type ChatPromptAttachment = {
  id: string;
  isImage: boolean;
  name: string;
  previewUrl: string | null;
  sizeLabel: string;
  extensionLabel: string;
};

export function formatAttachmentSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function getAttachmentExtensionLabel(file: Pick<File, "name" | "type">): string {
  const nameParts = file.name.split(".");
  const extension = nameParts.length > 1 ? nameParts.at(-1) : "";

  if (extension) {
    return extension.toUpperCase();
  }

  const mimeSubtype = file.type.split("/").at(-1);
  return mimeSubtype ? mimeSubtype.toUpperCase() : "FILE";
}

export function isImageAttachmentFile(file: Pick<File, "name" | "type">): boolean {
  return file.type.startsWith("image/") || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name);
}

export function createChatPromptAttachment(file: File, id: string): ChatPromptAttachment {
  const isImage = isImageAttachmentFile(file);

  return {
    id,
    isImage,
    name: file.name,
    previewUrl: isImage ? URL.createObjectURL(file) : null,
    sizeLabel: formatAttachmentSize(file.size),
    extensionLabel: getAttachmentExtensionLabel(file),
  };
}

export function revokeChatPromptAttachmentPreview(attachment: ChatPromptAttachment): void {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}
