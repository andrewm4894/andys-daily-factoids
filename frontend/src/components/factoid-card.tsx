"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import type { Factoid } from "@/lib/types";
import { submitFeedback, submitVote } from "@/lib/api";
import { useTheme } from "@/components/theme-provider";
import { FactoidChatPanel } from "@/components/factoid-chat-panel";

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
    undefined
  );
  const [showChat, setShowChat] = useState(false);
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [linkCopyStatus, setLinkCopyStatus] = useState<"idle" | "copied">(
    "idle"
  );
  const [showMetadataPopover, setShowMetadataPopover] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [metadataPosition, setMetadataPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkCopyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const metadataButtonRef = useRef<HTMLButtonElement | null>(null);
  const metadataPopoverRef = useRef<HTMLDivElement | null>(null);

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
    words.length > maxWords
      ? `${words.slice(0, maxWords).join(" ")}…`
      : trimmedText;
  const displayEmoji = factoid.emoji || "✨";

  const handleCardToggle = () => {
    setIsExpanded((previous) => {
      if (previous) {
        setShowFeedback(false);
        setShowChat(false);
        setShowMetadataPopover(false);
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
    setIsMounted(true);

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
      setShowMetadataPopover(false);
    };
  }, []);

  const computeMetadataPosition = () => {
    const button = metadataButtonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const width = 256; // matches w-64
    const top = rect.bottom + window.scrollY + 8; // approx mt-2
    const desiredLeft = rect.right + window.scrollX - width;
    const maxLeft = window.scrollX + window.innerWidth - width - 8;
    const left = Math.max(Math.min(desiredLeft, maxLeft), window.scrollX + 8);

    setMetadataPosition({ top, left });
  };

  useEffect(() => {
    if (!showMetadataPopover) {
      return;
    }

    computeMetadataPosition();

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !metadataButtonRef.current?.contains(target) &&
        !metadataPopoverRef.current?.contains(target)
      ) {
        setShowMetadataPopover(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMetadataPopover(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", computeMetadataPosition);
    window.addEventListener("scroll", computeMetadataPosition, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", computeMetadataPosition);
      window.removeEventListener("scroll", computeMetadataPosition, true);
    };
  }, [showMetadataPopover]);

  const metadataEntries: { label: string; value: string }[] = [];
  const metadata = factoid.generation_metadata;
  if (metadata && typeof metadata === "object") {
    const rawObject = metadata as Record<string, unknown>;
    const modelValue = rawObject.model;
    if (typeof modelValue === "string" && modelValue.trim() !== "") {
      metadataEntries.push({ label: "Model", value: modelValue });
    }
    const otherKeys = Object.entries(rawObject).filter(
      ([key]) => key !== "model" && key !== "raw"
    );
    for (const [key, value] of otherKeys) {
      if (value == null) {
        continue;
      }
      metadataEntries.push({ label: key, value: String(value) });
    }
    const rawValue = rawObject.raw;
    if (rawValue && typeof rawValue === "object") {
      const rawKeys = Object.entries(rawValue as Record<string, unknown>);
      for (const [key, value] of rawKeys) {
        if (value == null) {
          continue;
        }
        const formatted =
          typeof value === "string" ? value : JSON.stringify(value, null, 2);
        metadataEntries.push({ label: `raw.${key}`, value: formatted });
      }
    }
  }
  if (typeof factoid.cost_usd === "number") {
    metadataEntries.push({
      label: "Cost (USD)",
      value: factoid.cost_usd.toFixed(4),
    });
  }
  const createdDate = new Date(factoid.created_at);
  if (!Number.isNaN(createdDate.getTime())) {
    metadataEntries.push({
      label: "Created",
      value: createdDate.toLocaleString(),
    });
  }

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
    isExpanded ? " items-start" : " items-center justify-center text-center"
  }`;
  const headlineContainerClasses = isExpanded ? "flex-1" : "flex-none";
  const headlineTextClasses = `text-lg text-[color:var(--text-primary)] whitespace-pre-wrap${
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
          <span className="text-3xl mr-2" aria-hidden>
            {displayEmoji}
          </span>
          <div className={headlineContainerClasses}>
            <p className={headlineTextClasses}>{headlineText || "Factoid"}</p>
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
                  <span aria-hidden>
                    {copyStatus === "copied" ? "✅" : "📋"}
                  </span>
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
                  <span aria-hidden>
                    {linkCopyStatus === "copied" ? "✅" : "🔗"}
                  </span>
                  <span className="sr-only">
                    {linkCopyStatus === "copied" ? "Link copied" : "Copy link"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowFeedback(false);
                    setIsExpanded(true);
                    setShowChat((previous) => !previous);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  aria-label="Chat about this factoid"
                  title="Discuss with our AI overlords"
                >
                  <span aria-hidden>💬</span>
                  <span className="sr-only">Chat</span>
                </button>
                <div className="relative">
                  <button
                    type="button"
                    ref={metadataButtonRef}
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowMetadataPopover((previous) => {
                        const next = !previous;
                        if (next) {
                          computeMetadataPosition();
                        }
                        return next;
                      });
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--surface-card-border)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]"
                    aria-label="View factoid details"
                    aria-expanded={showMetadataPopover}
                    title="Factoid details"
                  >
                    <span aria-hidden>ℹ️</span>
                    <span className="sr-only">Details</span>
                  </button>
                  {isMounted &&
                    showMetadataPopover &&
                    metadataPosition &&
                    createPortal(
                      <div
                        ref={metadataPopoverRef}
                        className="z-50 w-64 max-w-xs rounded-md border border-[color:var(--surface-card-border)] bg-[color:var(--surface-card)] p-3 text-xs text-[color:var(--text-secondary)] shadow-lg"
                        role="dialog"
                        aria-label="Factoid details"
                        style={{
                          position: "absolute",
                          top: metadataPosition.top,
                          left: metadataPosition.left,
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {metadataEntries.length === 0 ? (
                          <p>No additional metadata available.</p>
                        ) : (
                          <dl className="max-h-60 space-y-2 overflow-y-auto">
                            {metadataEntries.map(({ label, value }, index) => (
                              <div key={`${label}-${index}`}>
                                <dt className="font-medium text-[color:var(--text-primary)]">
                                  {label}
                                </dt>
                                <dd className="whitespace-pre-wrap break-words">
                                  {value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>,
                      document.body
                    )}
                </div>
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
            {showChat && (
              <FactoidChatPanel
                factoid={factoid}
                onClose={() => setShowChat(false)}
              />
            )}
          </>
        )}
      </div>
    </article>
  );
}
