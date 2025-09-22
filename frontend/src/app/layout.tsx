import type { Metadata } from "next";
import { Suspense } from "react";
import { PostHogProvider, PostHogPageView } from "@/components/posthog-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andy\'s Daily Factoids",
  description: "Generate and explore AI-crafted factoids with feedback and rate limit insights.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900">
        <PostHogProvider>
          <Suspense fallback={<></>}>
            <PostHogPageView />
          </Suspense>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
