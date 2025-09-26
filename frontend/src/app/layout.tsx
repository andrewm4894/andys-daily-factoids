import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";

import {
  PostHogProvider,
  PostHogPageView,
} from "@/components/posthog-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andy\'s Daily Factoids",
  description:
    "Generate and explore AI-crafted factoids with feedback and rate limit insights.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google tag (gtag.js) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-981356332"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-981356332');
          `}
        </Script>
      </head>
      <body className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)] transition-colors duration-300">
        <Suspense fallback={<></>}>
          <ThemeProvider>
            <PostHogProvider>
              <PostHogPageView />
              {children}
            </PostHogProvider>
          </ThemeProvider>
        </Suspense>
      </body>
    </html>
  );
}
