"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ReactElement, type ReactNode } from "react";
import { posthog } from "@/lib/posthog";

// Declare gtag function for TypeScript
declare global {
  interface Window {
    gtag: (
      command: string,
      action: string,
      parameters?: Record<string, unknown>
    ) => void;
    dataLayer: unknown[];
  }
}

export function PostHogPageView(): ReactElement | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname && typeof window !== "undefined") {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = url + `?${searchParams.toString()}`;
      }

      // Track page view with PostHog
      posthog.capture("$pageview", {
        $current_url: url,
      });

      // Fire Google Ads conversion event for page view
      if (typeof window.gtag === "function") {
        window.gtag("event", "conversion", {
          send_to: "AW-981356332/GOyBCKrVmaIbEKye-dMD",
          value: 1.0,
          currency: "EUR",
        });
      }
    }
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Initialize PostHog on client side
    if (typeof window !== "undefined") {
      const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const apiHost =
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

      if (apiKey) {
        posthog.init(apiKey, {
          api_host: apiHost,
          person_profiles: "identified_only",
          capture_pageview: false, // We'll capture manually
        });
      }
    }
  }, []);

  return <>{children}</>;
}
