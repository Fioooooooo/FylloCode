import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { UIMessage } from "ai";
import { IpcErrorCodes } from "@shared/constants/error-codes";
import { ipcError } from "@shared/errors/ipc-error";
import type { MessageMeta } from "@shared/types/chat";
import { writeFileAtomicSync } from "./atomic-write";

const messageFileQueues = new Map<string, Promise<void>>();

async function withMessageFileQueue<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const previous = messageFileQueues.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  messageFileQueues.set(filePath, queued);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (messageFileQueues.get(filePath) === queued) messageFileQueues.delete(filePath);
  }
}

function parseMessagesStrict(content: string, filePath: string): Array<UIMessage<MessageMeta>> {
  const messages: Array<UIMessage<MessageMeta>> = [];
  for (const [index, rawLine] of content.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("message must be an object");
      }
      messages.push(parsed as UIMessage<MessageMeta>);
    } catch {
      throw ipcError(
        IpcErrorCodes.UNKNOWN_ERROR,
        `Malformed message at line ${index + 1} in ${filePath}`
      );
    }
  }
  return messages;
}

export async function appendMessageJsonl(
  filePath: string,
  message: UIMessage<MessageMeta>
): Promise<void> {
  await withMessageFileQueue(filePath, async () => {
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(message)}\n`, "utf8");
  });
}

export async function mutateMessageJsonl(
  filePath: string,
  mutate: (messages: Array<UIMessage<MessageMeta>>) => void
): Promise<void> {
  await withMessageFileQueue(filePath, async () => {
    const content = await fs.readFile(filePath, "utf8");
    const messages = parseMessagesStrict(content, filePath);
    mutate(messages);
    writeFileAtomicSync(
      filePath,
      messages.length === 0
        ? ""
        : `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`
    );
  });
}

export async function patchMessageJsonlMetadata(
  filePath: string,
  messageId: string,
  patch: Partial<MessageMeta>
): Promise<boolean> {
  let patched = false;
  await mutateMessageJsonl(filePath, (messages) => {
    const message = messages.find((candidate) => candidate.id === messageId);
    if (!message?.metadata) return;
    message.metadata = { ...message.metadata, ...patch };
    patched = true;
  });
  return patched;
}
