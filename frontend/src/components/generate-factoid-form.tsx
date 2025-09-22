"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FACTOIDS_API_BASE, generateFactoid } from "@/lib/api";

interface GenerateFactoidFormProps {
  models: string[];
}

export function GenerateFactoidForm({ models }: GenerateFactoidFormProps) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [modelKey, setModelKey] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    eventSourceRef.current?.close();

    const params = new URLSearchParams();
    if (topic) params.append("topic", topic);
    if (modelKey) params.append("model_key", modelKey);

    const streamUrl = `${FACTOIDS_API_BASE}/generate/stream/?${params.toString()}`;

    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setIsStreaming(true);
      setStatusMessage("Generating factoid...");
      generateFactoid(topic, modelKey)
        .then(() => {
          setStatusMessage("Factoid generated!");
          setTopic("");
          router.refresh();
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to generate factoid");
        })
        .finally(() => {
          setIsStreaming(false);
        });
      return;
    }

    setIsStreaming(true);
    setStatusMessage("Starting generation...");

    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("status", (message: MessageEvent<string>) => {
      try {
        const data = JSON.parse(message.data) as { state?: string };
        if (data.state) {
          setStatusMessage(`Status: ${data.state}`);
        }
      } catch {
        setStatusMessage("Generating factoid...");
      }
    });

    eventSource.addEventListener("factoid", () => {
      setStatusMessage("Factoid generated!");
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
      setError(detail);
      setIsStreaming(false);
      setStatusMessage(null);
      eventSource.close();
      eventSourceRef.current = null;
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label htmlFor="topic" className="block text-sm font-medium text-slate-700">
          Topic (optional)
        </label>
        <input
          id="topic"
          type="text"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="Space exploration, ancient history, surprising biology..."
          disabled={isStreaming}
          className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>

      <div>
        <label htmlFor="model" className="block text-sm font-medium text-slate-700">
          Model (optional)
        </label>
        <select
          id="model"
          value={modelKey ?? ""}
          onChange={(event) => setModelKey(event.target.value || undefined)}
          disabled={isStreaming}
          className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
        >
          <option value="">Automatic selection</option>
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {statusMessage && <p className="text-sm text-slate-600">{statusMessage}</p>}

      <button
        type="submit"
        disabled={isStreaming}
        className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isStreaming ? "Generating..." : "Generate factoid"}
      </button>
    </form>
  );
}
