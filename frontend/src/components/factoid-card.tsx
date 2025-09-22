"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { Factoid } from "@/lib/types";
import { submitFeedback, submitVote } from "@/lib/api";

interface FactoidCardProps {
  factoid: Factoid;
}

export function FactoidCard({ factoid }: FactoidCardProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackVote, setFeedbackVote] = useState<"up" | "down" | undefined>(
    undefined,
  );

  const handleVote = async (vote: "up" | "down") => {
    try {
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

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-slate-900">{factoid.subject || "Factoid"}</p>
          <time className="text-xs text-slate-500" dateTime={factoid.created_at}>
            {new Date(factoid.created_at).toLocaleString()}
          </time>
        </div>
        <span className="text-3xl" aria-hidden>
          {factoid.emoji || "✨"}
        </span>
      </div>

      <p className="mt-4 text-slate-700 whitespace-pre-wrap">{factoid.text}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <button
          type="button"
          onClick={() => handleVote("up")}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden>👍</span>
          Upvote ({factoid.votes_up})
        </button>
        <button
          type="button"
          onClick={() => handleVote("down")}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden>👎</span>
          Downvote ({factoid.votes_down})
        </button>
        <button
          type="button"
          onClick={() => setShowFeedback((prev) => !prev)}
          className="ml-auto text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
        >
          {showFeedback ? "Cancel" : "Leave feedback"}
        </button>
      </div>

      {showFeedback && (
        <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFeedbackVote("up")}
              className={`rounded-md border px-3 py-1 text-sm ${
                feedbackVote === "up"
                  ? "border-emerald-400 bg-emerald-100 text-emerald-700"
                  : "border-slate-200 text-slate-600 hover:border-emerald-200"
              }`}
            >
              Helpful
            </button>
            <button
              type="button"
              onClick={() => setFeedbackVote("down")}
              className={`rounded-md border px-3 py-1 text-sm ${
                feedbackVote === "down"
                  ? "border-rose-400 bg-rose-100 text-rose-700"
                  : "border-slate-200 text-slate-600 hover:border-rose-200"
              }`}
            >
              Not helpful
            </button>
          </div>
          <textarea
            className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
            rows={3}
            placeholder="Optional feedback..."
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
          />
          <button
            type="button"
            onClick={handleFeedbackSubmit}
            disabled={isSubmitting}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Submit feedback
          </button>
        </div>
      )}
    </article>
  );
}
