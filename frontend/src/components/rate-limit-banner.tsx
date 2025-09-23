"use client";

import { useEffect, useState } from "react";

import { fetchRateLimitStatus } from "@/lib/api";
import type { RateLimitStatus } from "@/lib/types";

export function RateLimitBanner() {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchRateLimitStatus()
      .then((data) => {
        if (isMounted) {
          setStatus(data);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Unable to load rate limit status: {error}
      </div>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <div className="mb-6 rounded-md border border-[color:var(--surface-panel-border)] bg-[color:var(--surface-panel)] p-4 text-sm text-[color:var(--text-muted)] shadow-sm backdrop-blur-sm">
      <p className="font-medium text-[color:var(--text-primary)]">Rate limit</p>
      <p className="mt-1">
        {status.rate_limit.current_window_requests}/{status.rate_limit.per_minute} requests used in the
        current minute window.
      </p>
      {status.cost_budget_remaining != null && (
        <p className="mt-1">Cost budget remaining: ${status.cost_budget_remaining.toFixed(2)}</p>
      )}
    </div>
  );
}
