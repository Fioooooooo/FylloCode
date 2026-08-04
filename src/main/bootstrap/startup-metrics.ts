import { performance } from "node:perf_hooks";
import { is } from "@electron-toolkit/utils";
import logger from "@main/infra/logger";

export const LIFECYCLE_METRIC_PHASES = [
  "process-entry",
  "single-instance-lock",
  "app-ready",
  "startup-window-created",
  "startup-page-loaded",
  "startup-visible",
  "shell-path-settled",
  "migration-settled",
  "cutover-validated",
  "runtime-wired",
  "formal-renderer-loaded",
  "renderer-interactive",
  "warmup-scheduled",
  "shutdown-requested",
  "shutdown-waiting-protected-migration",
  "windows-hidden",
  "shutdown-snapshot-and-hide",
  "shutdown-quiesce",
  "shutdown-terminate",
  "shutdown-finalize",
  "shutdown-complete",
  "shutdown-deadline",
] as const;

export type LifecycleMetricPhase = (typeof LIFECYCLE_METRIC_PHASES)[number];
export type LifecycleMetricResult = "ok" | "failed" | "timeout" | "cancelled";

interface LifecycleMetricRecord {
  phase: LifecycleMetricPhase;
  durationMs: number;
  result: LifecycleMetricResult;
  mode: "dev" | "prod";
}

interface LifecycleMetricsOptions {
  processEntryAt: number;
  now?: () => number;
  mode?: "dev" | "prod";
  log?: (record: LifecycleMetricRecord) => void;
}

export interface LifecycleMetrics {
  mark(phase: LifecycleMetricPhase, result?: LifecycleMetricResult): LifecycleMetricRecord;
  markAt(
    phase: LifecycleMetricPhase,
    markedAt: number,
    result?: LifecycleMetricResult
  ): LifecycleMetricRecord;
  measure(
    phase: LifecycleMetricPhase,
    from: LifecycleMetricPhase,
    result?: LifecycleMetricResult
  ): LifecycleMetricRecord;
  getMark(phase: LifecycleMetricPhase): number | undefined;
}

function roundDuration(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

/**
 * 指标 API 故意不接受任意 payload，避免路径、命令或用户数据进入生命周期日志。
 */
export function createLifecycleMetrics(options: LifecycleMetricsOptions): LifecycleMetrics {
  const now = options.now ?? (() => performance.now());
  const mode = options.mode ?? (is.dev ? "dev" : "prod");
  const marks = new Map<LifecycleMetricPhase, number>([["process-entry", options.processEntryAt]]);
  const write =
    options.log ??
    ((record: LifecycleMetricRecord) => {
      logger.info(`[lifecycle-metric] ${JSON.stringify(record)}`);
    });

  const emit = (
    phase: LifecycleMetricPhase,
    startedAt: number,
    result: LifecycleMetricResult
  ): LifecycleMetricRecord => {
    const record: LifecycleMetricRecord = {
      phase,
      durationMs: roundDuration(now() - startedAt),
      result,
      mode,
    };
    write(record);
    return record;
  };

  return {
    mark(phase, result = "ok") {
      const markedAt = now();
      marks.set(phase, markedAt);
      const record: LifecycleMetricRecord = {
        phase,
        durationMs: roundDuration(markedAt - options.processEntryAt),
        result,
        mode,
      };
      write(record);
      return record;
    },
    markAt(phase, markedAt, result = "ok") {
      marks.set(phase, markedAt);
      const record: LifecycleMetricRecord = {
        phase,
        durationMs: roundDuration(markedAt - options.processEntryAt),
        result,
        mode,
      };
      write(record);
      return record;
    },
    measure(phase, from, result = "ok") {
      return emit(phase, marks.get(from) ?? options.processEntryAt, result);
    },
    getMark(phase) {
      return marks.get(phase);
    },
  };
}

let lifecycleMetrics = createLifecycleMetrics({ processEntryAt: performance.now() });

export function configureLifecycleMetrics(options: LifecycleMetricsOptions): void {
  lifecycleMetrics = createLifecycleMetrics(options);
}

export function markLifecycleMetric(
  phase: LifecycleMetricPhase,
  result: LifecycleMetricResult = "ok"
): LifecycleMetricRecord {
  return lifecycleMetrics.mark(phase, result);
}

export function markLifecycleMetricAt(
  phase: LifecycleMetricPhase,
  markedAt: number,
  result: LifecycleMetricResult = "ok"
): LifecycleMetricRecord {
  return lifecycleMetrics.markAt(phase, markedAt, result);
}

export function measureLifecycleMetric(
  phase: LifecycleMetricPhase,
  from: LifecycleMetricPhase,
  result: LifecycleMetricResult = "ok"
): LifecycleMetricRecord {
  return lifecycleMetrics.measure(phase, from, result);
}
