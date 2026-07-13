// Re-export integration/provider-related IPC schemas so callers can import from the
// stable `@shared/schemas/ipc/*` path instead of the deeper `@shared/ipc/*` layout.
export * from "@shared/ipc/platform/providers.schemas";
export * from "@shared/ipc/automation/project-integration.schemas";
