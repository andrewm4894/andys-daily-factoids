"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { fulfillCheckoutSession } from "@/lib/api";
import type { Factoid } from "@/lib/types";
import { FactoidCard } from "@/components/factoid-card";
import { posthog } from "@/lib/posthog";

interface CheckoutSuccessProps {
  sessionId?: string;
}

type FulfillmentStatus = "idle" | "loading" | "success" | "error";

export function CheckoutSuccess({ sessionId }: CheckoutSuccessProps) {
  const [factoid, setFactoid] = useState<Factoid | null>(null);
  const [status, setStatus] = useState<FulfillmentStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const hasSessionId = useMemo(
    () => typeof sessionId === "string" && sessionId.length > 0,
    [sessionId]
  );

  const requestFulfillment = useCallback(() => {
    if (!hasSessionId || !sessionId) {
      setStatus("error");
      setError("Missing Stripe checkout session.");
      return;
    }

    setStatus("loading");
    setError(null);

    fulfillCheckoutSession(sessionId)
      .then((data) => {
        setFactoid(data);
        setStatus("success");
        posthog.capture("stripe_checkout_fulfilled", {
          session_id: sessionId,
          factoid_id: data.id,
          factoid_subject: data.subject,
        });
      })
      .catch((err) => {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "We could not finalize your purchase.";
        setError(message);
        setStatus("error");
        posthog.capture("stripe_checkout_fulfilled_failed", {
          session_id: sessionId,
          error: message,
        });
      });
  }, [hasSessionId, sessionId]);

  useEffect(() => {
    requestFulfillment();
  }, [requestFulfillment]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-[color:var(--text-primary)]">
          Thanks for supporting Andy&apos;s Daily Factoids!
        </h1>
        <p className="text-[color:var(--text-secondary)]">
          Your payment unlocks an immediate factoid. We generate it as soon as
          this page loads.
        </p>
      </header>

      {status === "loading" && (
        <div className="rounded-md border border-[color:var(--surface-panel-border)] bg-[color:var(--surface-panel)] p-4 text-sm text-[color:var(--text-secondary)] shadow-sm">
          Finalizing your checkout and generating a fresh factoid...
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 shadow-sm">
            <p className="font-semibold">We hit a snag</p>
            <p className="mt-1">
              {error ??
                "An unexpected error occurred while fulfilling your purchase."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={requestFulfillment}
              className="inline-flex items-center justify-center rounded-md border border-[color:var(--surface-card-border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] shadow-sm transition hover:border-[color:var(--surface-card-border-hover)] hover:text-[color:var(--text-primary)]"
            >
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-[color:var(--button-primary-bg)] px-4 py-2 text-sm font-medium text-[color:var(--button-primary-text)] transition hover:bg-[color:var(--button-primary-hover)]"
            >
              Back to homepage
            </Link>
          </div>
        </div>
      )}

      {status === "success" && factoid && (
        <div className="space-y-4">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm">
            <p className="font-semibold">You&apos;re good to go!</p>
            <p className="mt-1">
              We generated this factoid just for you. You can keep exploring
              from the homepage whenever you&apos;re ready.
            </p>
          </div>
          <FactoidCard factoid={factoid} initiallyExpanded models={[]} />
        </div>
      )}

      {(status === "loading" || status === "success") && (
        <div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-[color:var(--surface-card-border)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition hover:border-[color:var(--surface-card-border-hover)] hover:text-[color:var(--text-primary)]"
          >
            Return to homepage
          </Link>
        </div>
      )}
    </div>
  );
}
