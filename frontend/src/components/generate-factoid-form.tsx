"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe } from "@stripe/stripe-js";

import {
  ApiError,
  FACTOIDS_API_BASE,
  createCheckoutSession,
  generateFactoid,
} from "@/lib/api";
import { posthog } from "@/lib/posthog";

let stripePromise: Promise<Stripe | null> | null = null;
let stripePublishableKey: string | null = null;

async function getStripeClient(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromise || stripePublishableKey !== publishableKey) {
    stripePublishableKey = publishableKey;
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

interface GenerateFactoidFormProps {
  models: string[];
  onShuffle?: () => void;
  shuffleLoading?: boolean;
  onGenerationError?: (message: string | null) => void;
}

type GenerationStatus = "idle" | "starting" | "success" | "error";

export function GenerateFactoidForm({
  models,
  onShuffle,
  shuffleLoading = false,
  onGenerationError,
}: GenerateFactoidFormProps) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [modelKey, setModelKey] = useState<string | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [isCheckoutRedirecting, setIsCheckoutRedirecting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const statusResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (statusResetRef.current) {
        clearTimeout(statusResetRef.current);
      }
    };
  }, []);

  const clearStatusReset = () => {
    if (statusResetRef.current) {
      clearTimeout(statusResetRef.current);
      statusResetRef.current = null;
    }
  };

  const scheduleStatusReset = () => {
    clearStatusReset();
    statusResetRef.current = setTimeout(() => {
      setStatus("idle");
    }, 2500);
  };

  const startCheckoutFlow = async ({
    retryAfter,
  }: { retryAfter?: number } = {}) => {
    if (isCheckoutRedirecting || typeof window === "undefined") {
      return;
    }

    setIsCheckoutRedirecting(true);
    posthog.capture("stripe_checkout_initiated", {
      reason: "rate_limit",
      retry_after: retryAfter ?? null,
      topic: topic || "random",
      model: modelKey || "automatic",
    });

    try {
      const successUrl = `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = window.location.href;
      const metadata: Record<string, unknown> = {};
      if (retryAfter !== undefined) {
        metadata.retry_after = retryAfter;
      }
      if (topic) {
        metadata.topic = topic;
      }
      if (modelKey) {
        metadata.model_key = modelKey;
      }
      const distinctId = posthog?.get_distinct_id?.();
      if (distinctId) {
        metadata.posthog_distinct_id = distinctId;
      }
      const session = await createCheckoutSession({
        success_url: successUrl,
        cancel_url: cancelUrl,
        source: "rate_limit",
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });

      if (session.checkout_url) {
        window.location.assign(session.checkout_url);
        return;
      }

      if (session.session_id && session.publishable_key) {
        const stripe = await getStripeClient(session.publishable_key);
        if (!stripe) {
          throw new Error("Stripe.js failed to initialize");
        }
        const { error } = await stripe.redirectToCheckout({
          sessionId: session.session_id,
        });
        if (error) {
          throw error;
        }
        return;
      }

      throw new Error("Checkout session missing redirect information");
    } catch (error) {
      console.error("Failed to launch Stripe checkout", error);
      let detail = "Failed to start Stripe checkout";
      if (error instanceof ApiError) {
        if (error.status === 503) {
          detail =
            "Payments are currently unavailable. Please try again later.";
        } else if (error.message) {
          detail = error.message;
        }
      } else if (error instanceof Error && error.message) {
        detail = error.message;
      }

      posthog.capture("stripe_checkout_failed", {
        reason: "rate_limit",
        error: detail,
        topic: topic || "random",
        model: modelKey || "automatic",
      });

      setStatus("error");
      onGenerationError?.(detail);
      scheduleStatusReset();
    } finally {
      setIsCheckoutRedirecting(false);
    }
  };

  const handleRateLimitExceeded = (detail?: string, retryAfter?: number) => {
    clearStatusReset();
    const message =
      detail && detail.trim()
        ? detail
        : "You have reached the free factoid limit. Redirecting to checkout...";
    setStatus("error");
    onGenerationError?.(message);
    posthog.capture("factoid_rate_limit_exceeded", {
      retry_after: retryAfter ?? null,
      topic: topic || "random",
      model: modelKey || "automatic",
    });
    void startCheckoutFlow({ retryAfter });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    eventSourceRef.current?.close();

    clearStatusReset();
    setStatus("starting");
    onGenerationError?.(null);

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
    if (posthogDistinctId)
      params.append("posthog_distinct_id", posthogDistinctId);
    if (hasPosthogProperties)
      params.append("posthog_properties", JSON.stringify(posthogProperties));

    const streamUrl = `${FACTOIDS_API_BASE}/generate/stream/?${params.toString()}`;

    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setIsStreaming(true);
      generateFactoid(topic, modelKey, {
        posthogDistinctId,
        posthogProperties: hasPosthogProperties ? posthogProperties : undefined,
      })
        .then(() => {
          setStatus("success");
          scheduleStatusReset();
          setTopic("");
          router.refresh();
          onGenerationError?.(null);
        })
        .catch((err) => {
          console.error("Failed to generate factoid", err);
          if (err instanceof ApiError && err.status === 429) {
            let retryAfter: number | undefined;
            if (err.data && typeof err.data === "object" && err.data !== null) {
              const candidate = (err.data as { retry_after?: unknown })
                .retry_after;
              if (typeof candidate === "number") {
                retryAfter = candidate;
              }
            }
            handleRateLimitExceeded(err.message, retryAfter);
            return;
          }

          const detail =
            err instanceof Error ? err.message : "Failed to generate factoid";
          setStatus("error");
          scheduleStatusReset();
          onGenerationError?.(detail);
        })
        .finally(() => {
          setIsStreaming(false);
        });
      return;
    }

    setIsStreaming(true);

    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("status", (message: MessageEvent<string>) => {
      try {
        const data = JSON.parse(message.data) as { state?: string };
        if (!data.state) {
          setStatus("starting");
        }
      } catch {
        setStatus("starting");
      }
    });

    eventSource.addEventListener("factoid", (message: MessageEvent<string>) => {
      setStatus("success");
      scheduleStatusReset();
      onGenerationError?.(null);

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
      let code: string | undefined;
      let retryAfter: number | undefined;
      try {
        const data = JSON.parse(message.data) as {
          detail?: string;
          code?: string;
          retry_after?: number;
        };
        if (data.detail) {
          detail = data.detail;
        }
        code = data.code;
        if (typeof data.retry_after === "number") {
          retryAfter = data.retry_after;
        }
      } catch {
        // ignore parse errors
      }

      setIsStreaming(false);
      eventSource.close();
      eventSourceRef.current = null;

      if (code === "rate_limit") {
        handleRateLimitExceeded(detail, retryAfter);
        return;
      }

      posthog.capture("factoid_generation_failed", {
        topic: topic || "random",
        model: modelKey || "random",
        error: detail,
        has_topic: !!topic,
        has_model: !!modelKey,
      });

      setStatus("error");
      scheduleStatusReset();
      onGenerationError?.(detail);
    });
  };

  const optionsId = "generate-factoid-options";

  const baseButtonClass =
    "inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";
  let statusClassName: string;
  if (isCheckoutRedirecting) {
    statusClassName = "bg-indigo-600 text-white hover:bg-indigo-500";
  } else if (status === "success") {
    statusClassName = "bg-emerald-600 text-white hover:bg-emerald-500";
  } else if (status === "error") {
    statusClassName = "bg-rose-600 text-white hover:bg-rose-500";
  } else if (isStreaming || status === "starting") {
    statusClassName =
      "bg-[color:var(--button-primary-hover)] text-[color:var(--button-primary-text)] hover:bg-[color:var(--button-primary-hover)]";
  } else {
    statusClassName =
      "bg-[color:var(--button-primary-bg)] text-[color:var(--button-primary-text)] hover:bg-[color:var(--button-primary-hover)]";
  }

  const buttonLabel = isCheckoutRedirecting
    ? "Redirecting to checkout..."
    : status === "success"
      ? "Factoid ready!"
      : status === "error"
        ? "Generation failed"
        : isStreaming || status === "starting"
          ? "Generating..."
          : "Generate factoid";

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 space-y-4 rounded-lg border border-[color:var(--surface-panel-border)] bg-[color:var(--surface-panel)] p-6 shadow-sm backdrop-blur-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 sm:flex-1">
          <button
            type="submit"
            disabled={isStreaming || isCheckoutRedirecting}
            className={`${baseButtonClass} ${statusClassName}`}
            title="Generate a factoid - press show options to pick topic and model"
          >
            {buttonLabel}
          </button>
          {onShuffle && (
            <button
              type="button"
              onClick={onShuffle}
              disabled={isStreaming || shuffleLoading || isCheckoutRedirecting}
              className="inline-flex w-full items-center justify-center rounded-md border border-[color:var(--surface-card-border)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition hover:border-[color:var(--surface-card-border-hover)] hover:text-[color:var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-outline)] disabled:cursor-not-allowed disabled:opacity-60"
              title="Randomly sample a different batch"
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
          disabled={isStreaming || isCheckoutRedirecting}
          aria-expanded={showAdvanced}
          aria-controls={optionsId}
          className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {showAdvanced ? "Hide options" : "Show options"}{" "}
          {showAdvanced ? "↑" : "↓"}
        </button>
      </div>

      {showAdvanced && (
        <div
          id={optionsId}
          className="space-y-4 border-t border-[color:var(--surface-card-border)] pt-4"
        >
          <div>
            <label
              htmlFor="topic"
              className="block text-sm font-medium text-[color:var(--text-primary)]"
            >
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
            <label
              htmlFor="model"
              className="block text-sm font-medium text-[color:var(--text-primary)]"
            >
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
