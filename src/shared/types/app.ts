export type RendererErrorSource = "vue" | "window-error" | "unhandledrejection";

export interface RendererErrorReport {
  source: RendererErrorSource;
  message: string;
  timestamp: string;
  name?: string;
  stack?: string;
  info?: string;
  route?: string;
}
