"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FACTOIDS_API_BASE, generateFactoid } from "@/lib/api";
import { posthog } from "@/lib/posthog";

interface GenerateFactoidFormProps {
  models: string[];
  onShuffle?: () => void;
  shuffleLoading?: boolean;
}

export function GenerateFactoidForm({
  models,
  onShuffle,
  shuffleLoading = false,
}: GenerateFactoidFormProps) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [modelKey, setModelKey] = useState<string | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [toast, setToast] = useState<
    { message: string; tone: "info" | "success" | "error" } | null
  >(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    eventSourceRef.current?.close();

    setToast({ message: "Starting generation…", tone: "info" });

    posthog.capture("factoid_generation_started", {
      topic: topic || "random",
      model: modelKey || "random",
      has_topic: !!topic,
      has_model: !!modelKey,
    });

    const posthogDistinctId = posthog?.get_distinct_id?.() ?? undefined;
    const posthogProperties: Record<string, unknown> = {};
    const phAny = posthog as unknown as {
      persistence?: { props?: Record<string, unknown> };
      sessionPropsManager?: { getSessionProps?: () => Record<string, unknown> };
      get_property?: (key: string) => unknown;
    };

    const persistenceProps = phAny?.persistence?.props;
    if (persistenceProps && typeof persistenceProps === "object") {
      for (const [key, value] of Object.entries(persistenceProps)) {
        if (value !== undefined && value !== null) {
          posthogProperties[key] = value;
        }
      }
    }

    const sessionProps = phAny?.sessionPropsManager?.getSessionProps?.();
    if (sessionProps && typeof sessionProps === "object") {
      for (const [key, value] of Object.entries(sessionProps)) {
        if (value !== undefined && value !== null) {
          posthogProperties[key] = value;
        }
      }
    }

    if (typeof window !== "undefined") {
      posthogProperties.$current_url = window.location.href;
      if (typeof document !== "undefined" && document.referrer) {
        posthogProperties.$referrer = document.referrer;
      }
    }

    const propertyKeys = [
      "$browser",
      "$browser_version",
      "$device_type",
      "$device_id",
      "$ip",
      "$os",
      "$os_version",
    ];

    for (const key of propertyKeys) {
      const value = phAny?.get_property?.(key);
      if (value !== undefined && value !== null) {
        posthogProperties[key] = value as unknown;
      }
    }

    const hasPosthogProperties = Object.keys(posthogProperties).length > 0;

    const params = new URLSearchParams();
    if (topic) params.append("topic", topic);
    if (modelKey) params.append("model_key", modelKey);
    if (posthogDistinctId) params.append("posthog_distinct_id", posthogDistinctId);
    if (hasPosthogProperties)
      params.append("posthog_properties", JSON.stringify(posthogProperties));

    const streamUrl = `${FACTOIDS_API_BASE}/generate/stream/?${params.toString()}`;

    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setIsStreaming(true);
      setToast({ message: "Generating factoid…", tone: "info" });
      generateFactoid(topic, modelKey, {
        posthogDistinctId,
        posthogProperties: hasPosthogProperties ? posthogProperties : undefined,
      })
        .then(() => {
          setToast({ message: "Factoid generated!", tone: "success" });
          setTopic("");
          router.refresh();
        })
        .catch((err) => {
          const detail =
            err instanceof Error ? err.message : "Failed to generate factoid";
          setToast({ message: detail, tone: "error" });
        })
        .finally(() => {
          setIsStreaming(false);
        });
      return;
    }

    setIsStreaming(true);
    setToast({ message: "Generating factoid…", tone: "info" });

    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("status", (message: MessageEvent<string>) => {
      try {
        const data = JSON.parse(message.data) as { state?: string };
        if (data.state) {
          setToast({ message: data.state, tone: "info" });
        } else {
          setToast({ message: "Generating factoid…", tone: "info" });
        }
      } catch {
        setToast({ message: "Generating factoid…", tone: "info" });
      }
    });

    eventSource.addEventListener("factoid", (message: MessageEvent<string>) => {
      setToast({ message: "Factoid generated!", tone: "success" });

      try {
        const data = JSON.parse(message.data);
        posthog.capture("factoid_generation_completed", {
          topic: topic || "random",
          model: modelKey || "random",
          factoid_subject: data.subject,
          factoid_emoji: data.emoji,
          has_topic: !!topic,
          has_model: !!modelKey,
        });
      } catch {
        posthog.capture("factoid_generation_completed", {
          topic: topic || "random",
          model: modelKey || "random",
          has_topic: !!topic,
          has_model: !!modelKey,
        });
      }

      eventSource.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      setTopic("");
      router.refresh();
    });

    eventSource.addEventListener("error", (message: MessageEvent<string>) => {
      let detail = "Failed to generate factoid";
      try {
        const data = JSON.parse(message.data) as { detail?: string };
        if (data.detail) {
          detail = data.detail;
        }
      } catch {
        // ignore parse errors
      }

      posthog.capture("factoid_generation_failed", {
        topic: topic || "random",
        model: modelKey || "random",
        error: detail,
        has_topic: !!topic,
        has_model: !!modelKey,
      });

      setToast({ message: detail, tone: "error" });
      setIsStreaming(false);
      eventSource.close();
      eventSourceRef.current = null;
    });
  };

  const toastToneClass =
    toast?.tone === "success"
      ? "bg-emerald-600 text-white"
      : toast?.tone === "error"
      ? "bg-rose-600 text-white"
      : "bg-[color:var(--button-primary-bg)] text-[color:var(--button-primary-text)]";
  const optionsId = "generate-factoid-options";

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 space-y-4 rounded-lg border border-[color:var(--surface-panel-border)] bg-[color:var(--surface-panel)] p-6 shadow-sm backdrop-blur-sm"
    >
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-4 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg ${toastToneClass}`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <button
            type="submit"
            disabled={isStreaming}
            className="inline-flex w-full items-center justify-center rounded-md bg-[color:var(--button-primary-bg)] px-4 py-2 text-sm font-medium text-[color:var(--button-primary-text)] transition hover:bg-[color:var(--button-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isStreaming ? "Generating..." : "Generate factoid"}
          </button>
          {onShuffle && (
            <button
              type="button"
              onClick={onShuffle}
              disabled={isStreaming || shuffleLoading}
              className="inline-flex w-full items-center justify-center rounded-md border border-[color:var(--surface-card-border)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition hover:border-[color:var(--surface-card-border-hover)] hover:text-[color:var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-outline)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              title="Shuffle visible factoids"
            >
              {shuffleLoading ? "Shuffling..." : "Shuffle factoids ↺"}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            const newState = !showAdvanced;
            setShowAdvanced(newState);
            posthog.capture("advanced_options_toggled", {
              expanded: newState,
            });
          }}
          disabled={isStreaming}
          aria-expanded={showAdvanced}
          aria-controls={optionsId}
          className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {showAdvanced ? "Hide options" : "Show options"} {showAdvanced ? "↑" : "↓"}
        </button>
      </div>

      {showAdvanced && (
        <div id={optionsId} className="space-y-4 border-t border-[color:var(--surface-card-border)] pt-4">
          <div>
            <label htmlFor="topic" className="block text-sm font-medium text-[color:var(--text-primary)]">
              Topic (optional)
            </label>
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Space exploration, ancient history, surprising biology..."
              disabled={isStreaming}
              className="mt-1 w-full rounded-md border border-[color:var(--input-border)] bg-[color:var(--input-bg)] p-2 text-sm text-[color:var(--text-secondary)] focus:border-[color:var(--input-border-focus)] focus:outline-none disabled:cursor-not-allowed disabled:bg-[color:var(--input-disabled-bg)]"
            />
          </div>

          <div>
            <label htmlFor="model" className="block text-sm font-medium text-[color:var(--text-primary)]">
              Model (optional)
            </label>
            <select
              id="model"
              value={modelKey ?? ""}
              onChange={(event) => setModelKey(event.target.value || undefined)}
              disabled={isStreaming}
              className="mt-1 w-full rounded-md border border-[color:var(--input-border)] bg-[color:var(--input-bg)] p-2 text-sm text-[color:var(--text-secondary)] focus:border-[color:var(--input-border-focus)] focus:outline-none"
            >
              <option value="">Automatic selection</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </form>
  );
}
