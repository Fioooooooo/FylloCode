// Re-export proposal-related IPC schemas so callers can import from the stable
// `@shared/schemas/ipc/*` path instead of the deeper `@shared/ipc/*` layout.
export * from "@shared/ipc/proposal/browser.schemas";
export * from "@shared/ipc/proposal/apply.schemas";
export * from "@shared/ipc/proposal/archive.schemas";
