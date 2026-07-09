import type { App as VueApp, ComponentPublicInstance } from "vue";
import { appApi } from "@renderer/api/platform/app";
import type { RendererErrorReport, RendererErrorSource } from "@shared/types/app";

const MAX_MESSAGE_LENGTH = 8000;
const MAX_STACK_LENGTH = 16000;
const MAX_INFO_LENGTH = 2000;
const DEDUPE_WINDOW_MS = 5000;
const MAX_RECENT_REPORTS = 50;

const recentReports = new Map<string, number>();

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    const json = JSON.stringify(value);
    if (json) {
      return json;
    }
  } catch {
    // Fall through to String(value).
  }

  return String(value);
}

export function serializeErrorReason(
  reason: unknown
): Pick<RendererErrorReport, "message" | "name" | "stack"> {
  if (reason instanceof Error) {
    return {
      message: truncate(reason.message || reason.name, MAX_MESSAGE_LENGTH) ?? "Unknown error",
      name: truncate(reason.name, 200),
      stack: truncate(reason.stack, MAX_STACK_LENGTH),
    };
  }

  return {
    message: truncate(stringifyUnknown(reason), MAX_MESSAGE_LENGTH) ?? "Unknown error",
  };
}

function toReport(
  source: RendererErrorSource,
  reason: unknown,
  options: { info?: string; route?: string } = {}
): RendererErrorReport {
  const serialized = serializeErrorReason(reason);

  return {
    source,
    message: serialized.message,
    timestamp: new Date().toISOString(),
    name: serialized.name,
    stack: serialized.stack,
    info: truncate(options.info, MAX_INFO_LENGTH),
    route: truncate(options.route, MAX_INFO_LENGTH),
  };
}

function shouldReport(report: RendererErrorReport): boolean {
  const now = Date.now();
  const key = `${report.source}:${report.message}:${report.stack ?? ""}`;
  const previous = recentReports.get(key);

  if (previous && now - previous < DEDUPE_WINDOW_MS) {
    return false;
  }

  recentReports.set(key, now);
  if (recentReports.size > MAX_RECENT_REPORTS) {
    const oldestKey = recentReports.keys().next().value;
    if (oldestKey) {
      recentReports.delete(oldestKey);
    }
  }

  return true;
}

async function reportRendererError(report: RendererErrorReport): Promise<void> {
  if (!shouldReport(report)) {
    return;
  }

  try {
    await appApi.reportRendererError(report);
  } catch (error) {
    console.error("[renderer-error-reporting] failed to persist renderer error", error);
  }
}

export function installErrorReporting(
  app: VueApp,
  options: { getRoute?: () => string | undefined } = {}
): void {
  const previousErrorHandler = app.config.errorHandler;

  app.config.errorHandler = (
    error: unknown,
    instance: ComponentPublicInstance | null,
    info: string
  ) => {
    previousErrorHandler?.(error, instance, info);
    void reportRendererError(
      toReport("vue", error, {
        info,
        route: options.getRoute?.(),
      })
    );
  };

  window.addEventListener("error", (event) => {
    void reportRendererError(
      toReport("window-error", event.error ?? event.message, {
        info: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
        route: options.getRoute?.(),
      })
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    void reportRendererError(
      toReport("unhandledrejection", event.reason, {
        route: options.getRoute?.(),
      })
    );
  });
}
