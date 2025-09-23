"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

import type { Factoid } from "@/lib/types";
import { submitFeedback, submitVote } from "@/lib/api";
import { useTheme } from "@/components/theme-provider";

interface FactoidCardProps {
  factoid: Factoid;
  initiallyExpanded?: boolean;
  isAlternate?: boolean;
  colorIndex?: number;
}

export function FactoidCard({
  factoid,
  initiallyExpanded = false,
  isAlternate = false,
  colorIndex,
}: FactoidCardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackVote, setFeedbackVote] = useState<"up" | "down" | undefined>(
    undefined,
  );
  const [showChatModal, setShowChatModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [linkCopyStatus, setLinkCopyStatus] = useState<"idle" | "copied">("idle");
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkCopyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const trimmedText = factoid.text.trim();
  const words = trimmedText === "" ? [] : trimmedText.split(/\s+/);
  
  // Deterministically pick between 4, 5, or 6 words for visual variety
  // Use factoid ID to ensure consistent server/client rendering
  const getWordCount = () => {
    const counts = [4, 5, 6];
    // Use a simple hash of the factoid ID to get consistent results
    let hash = 0;
    for (let i = 0; i < factoid.id.length; i++) {
      hash = ((hash << 5) - hash + factoid.id.charCodeAt(i)) & 0xffffffff;
    }
    return counts[Math.abs(hash) % counts.length];
  };
  
  const maxWords = getWordCount();
  const teaserText =
    words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}…` : trimmedText;
  const displayEmoji = factoid.emoji || "✨";

  const handleCardToggle = () => {
    setIsExpanded((previous) => {
      if (previous) {
        setShowFeedback(false);
        if (copyResetRef.current) {
          clearTimeout(copyResetRef.current);
          copyResetRef.current = null;
        }
        if (linkCopyResetRef.current) {
          clearTimeout(linkCopyResetRef.current);
          linkCopyResetRef.current = null;
        }
        setCopyStatus("idle");
        setLinkCopyStatus("idle");
      }
      return !previous;
    });
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardToggle();
    }
  };

  useEffect(() => {
    return () => {
      if (copyResetRef.current) {
        clearTimeout(copyResetRef.current);
      }
      if (linkCopyResetRef.current) {
        clearTimeout(linkCopyResetRef.current);
      }
      if (feedbackFocusTimeoutRef.current) {
        clearTimeout(feedbackFocusTimeoutRef.current);
      }
    };
  }, []);

  const handleVote = async (vote: "up" | "down") => {
    try {
      setShowFeedback(true);
      setFeedbackVote(vote);
      if (feedbackFocusTimeoutRef.current) {
        clearTimeout(feedbackFocusTimeoutRef.current);
      }
      feedbackFocusTimeoutRef.current = setTimeout(() => {
        feedbackTextareaRef.current?.focus();
      }, 0);
      setIsSubmitting(true);
      await submitVote(factoid.id, vote);
      router.refresh();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeedbackSubmit = async () => {
    try {
      setIsSubmitting(true);
      await submitFeedback({
        factoid: factoid.id,
        vote: feedbackVote,
        comments: feedbackText,
      });
      setShowFeedback(false);
      setFeedbackText("");
      setFeedbackVote(undefined);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSearch = () => {
    const query = encodeURIComponent(factoid.text);
    const url = `https://www.google.com/search?q=${query}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const headlineText = isExpanded ? factoid.text : teaserText;
  const headerClasses = `flex gap-4${
    isExpanded
      ? " items-start"
      : " items-center justify-center text-center"
  }`;
  const headlineContainerClasses = isExpanded ? "flex-1" : "flex-none";
  const headlineTextClasses = `text-lg font-semibold text-[color:var(--text-primary)] whitespace-pre-wrap${
    isExpanded ? "" : " text-center"
  }`;
  const baseArticleClasses =
    "factoid-card group relative overflow-hidden rounded-xl border border-[color:var(--surface-card-border)] p-6 text-[color:var(--text-primary)] shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[color:var(--surface-card-border-hover)] hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-outline)]";
  const articleBackgroundClass = isAlternate
    ? "bg-[color:var(--surface-card-alt)]"
    : "bg-[color:var(--surface-card)]";
  const rainbowClass =
    typeof colorIndex === "number" && Number.isFinite(colorIndex)
      ? `rainbow-card-${colorIndex}`
      : "";
  const articleClasses = `${baseArticleClasses} ${articleBackgroundClass}${
    rainbowClass ? ` ${rainbowClass}` : ""
  }`;

  const formatShareUrl = (baseUrl: string) => {
    if (!theme) {
      return baseUrl;
    }
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}theme=${encodeURIComponent(theme)}`;
  };

  const resolveShareUrl = () => {
    if (typeof window !== "undefined" && window.location?.origin) {
      return formatShareUrl(`${window.location.origin}/factoids/${factoid.id}`);
    }
    const envBase = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    if (envBase) {
      return formatShareUrl(`${envBase}/factoids/${factoid.id}`);
    }
    return formatShareUrl(`/factoids/${factoid.id}`);
  };

  const handleCopyFactoid = () => {
    if (copyResetRef.current) {
      clearTimeout(copyResetRef.current);
      copyResetRef.current = null;
    }

    if (navigator.clipboard?.writeText) {
      const shareUrl = resolveShareUrl();
      const copyPayload = `${factoid.text.trim()}\n\nKeep exploring factoids: ${shareUrl}`;

      navigator.clipboard
        .writeText(copyPayload)
        .then(() => {
          setCopyStatus("copied");
          copyResetRef.current = setTimeout(() => {
            setCopyStatus("idle");
            copyResetRef.current = null;
          }, 2000);
        })
        .catch((error) => {
          console.error("Failed to copy factoid", error);
        });
    } else {
      console.warn("Clipboard API not available");
    }
  };

  const handleCopyLink = () => {
    if (linkCopyResetRef.current) {
      clearTimeout(linkCopyResetRef.current);
      linkCopyResetRef.current = null;
    }

    if (navigator.clipboard?.writeText) {
      const shareUrl = resolveShareUrl();

      navigator.clipboard
        .writeText(shareUrl)
        .then(() => {
          setLinkCopyStatus("copied");
          linkCopyResetRef.current = setTimeout(() => {
            setLinkCopyStatus("idle");
            linkCopyResetRef.current = null;
          }, 2000);
        })
        .catch((error) => {
          console.error("Failed to copy link", error);
        });
    } else {
      console.warn("Clipboard API not available");
    }
  };

  return (
    <article
      className={articleClasses}
      role="button"
      tabIndex={0}
      onClick={handleCardToggle}
      onKeyDown={handleCardKeyDown}
      aria-expanded={isExpanded}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{ background: "var(--card-overlay)" }}
      />
      <div className="relative z-[1]">
        <div className={headerClasses}>
          <span className="text-3xl" aria-hidden>
            {displayEmoji}
          </span>
          <div className={headlineContainerClasses}>
            <p className={headlineTextClasses}>
              {headlineText || "Factoid"}
            </p>
          </div>
        </div>

        {isExpanded && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-[color:var(--text-muted)]">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleVote("up");
                  }}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  title="My mind is blown!"
                >
                  <span aria-hidden>🤯</span>
                  Mind blown ({factoid.votes_up})
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleVote("down");
                  }}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Meh"
                >
                  <span aria-hidden>😒</span>
                  Meh ({factoid.votes_down})
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleGoogleSearch();
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-sky-200 px-3 py-1 text-sky-700 hover:bg-sky-50"
                  aria-label="Search this factoid on Google"
                  title="Search up that bad boi"
                >
                  <span aria-hidden className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                    >
                      <path
                        d="M21.35 11.1h-8.9v2.89h5.12c-.22 1.18-1.34 3.46-5.12 3.46-3.08 0-5.59-2.55-5.59-5.67s2.51-5.67 5.59-5.67c1.75 0 2.92.74 3.59 1.37l2.45-2.36C16.93 3.39 14.84 2.5 12.35 2.5 7.4 2.5 3.35 6.55 3.35 11.5s4.05 9 9 9c5.2 0 8.65-3.65 8.65-8.8 0-.59-.06-1.04-.15-1.6z"
                        fill="#4285F4"
                      />
                    </svg>
                  </span>
                  this ASAP!
                </button>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCopyFactoid();
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-card-border)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
                  aria-label="Copy factoid text"
                  title="Copy this factoid"
                >
                  <span aria-hidden>{copyStatus === "copied" ? "✅" : "📋"}</span>
                  <span className="sr-only">
                    {copyStatus === "copied" ? "Copied" : "Copy"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCopyLink();
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-card-border)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
                  aria-label="Copy link to this factoid"
                  title="Copy link"
                >
                  <span aria-hidden>{linkCopyStatus === "copied" ? "✅" : "🔗"}</span>
                  <span className="sr-only">
                    {linkCopyStatus === "copied" ? "Link copied" : "Copy link"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowChatModal(true);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  aria-label="Chat about this factoid"
                  title="Discuss with our AI overlords"
                >
                  <span aria-hidden>💬</span>
                  <span className="sr-only">Chat</span>
                </button>
              </div>
            </div>

          {showFeedback && (
            <div
              className="mt-4 space-y-3 rounded-md border border-[color:var(--surface-card-border)] bg-[color:var(--surface-muted)] p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <textarea
                className="w-full rounded-md border border-[color:var(--input-border)] bg-[color:var(--input-bg)] p-2 text-sm text-[color:var(--text-secondary)] focus:border-[color:var(--input-border-focus)] focus:outline-none"
                rows={3}
                placeholder="Optional feedback..."
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                ref={feedbackTextareaRef}
              />
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleFeedbackSubmit();
                }}
                disabled={isSubmitting}
                className="rounded-md bg-[color:var(--button-primary-bg)] px-3 py-2 text-sm font-medium text-[color:var(--button-primary-text)] transition-colors hover:bg-[color:var(--button-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Submit feedback
              </button>
            </div>
          )}
        </>
      )}
      </div>
      {showChatModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Chat coming soon"
          onClick={(event) => {
            event.stopPropagation();
            setShowChatModal(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-[color:var(--surface-card-border)] bg-[color:var(--surface-card)] p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">Chat coming soon</h2>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              Chatting with our AI overlords is almost here. Thanks for your patience!
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShowChatModal(false);
              }}
              className="mt-4 w-full rounded-md bg-[color:var(--button-primary-bg)] px-3 py-2 text-sm font-medium text-[color:var(--button-primary-text)] transition-colors hover:bg-[color:var(--button-primary-hover)]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
