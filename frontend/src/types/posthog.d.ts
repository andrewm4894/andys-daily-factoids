import "posthog-js";

declare module "posthog-js" {
  interface PostHogStatic {
    captureTraceFeedback?: (traceId: string, feedback: string) => void;
    captureTraceMetric?: (
      traceId: string,
      metricName: string,
      metricValue: "good" | "bad" | number
    ) => void;
  }
}
