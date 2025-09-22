"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { generateFactoid } from "@/lib/api";

interface GenerateFactoidFormProps {
  models: string[];
}

export function GenerateFactoidForm({ models }: GenerateFactoidFormProps) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [modelKey, setModelKey] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await generateFactoid(topic, modelKey);
        setTopic("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate factoid");
      }
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
          className="mt-1 w-full rounded-md border border-slate-200 p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
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

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Generating..." : "Generate factoid"}
      </button>
    </form>
  );
}
