// Re-export settings/release-related IPC schemas so callers can import from the
// stable `@shared/schemas/ipc/*` path instead of the deeper `@shared/ipc/*` layout.
export * from "@shared/ipc/platform/settings.schemas";
export { checkLatestReleaseInputSchema } from "@shared/ipc/platform/release.schemas";
