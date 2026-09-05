"use client";

import { FactoidCard } from "@/components/factoid-card";
import { getFactoidModel } from "@/lib/factoid";
import type { Factoid } from "@/lib/types";

interface WallOfShameContentProps {
  factoids: Factoid[];
  models: string[];
}

export function WallOfShameContent({
  factoids,
  models,
}: WallOfShameContentProps) {
  if (factoids.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[color:var(--surface-card-border)] p-6 text-center text-sm text-[color:var(--text-muted)]">
        No shameful factoids yet. Every factoid is holding its head high!
      </p>
    );
  }

  return (
    <ol className="space-y-6">
      {factoids.map((factoid, index) => {
        const model = getFactoidModel(factoid);
        return (
          <li key={factoid.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-muted)] sm:text-sm">
              <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full border border-[color:var(--surface-card-border)] bg-[color:var(--surface-card)] px-2 font-semibold text-[color:var(--text-primary)]">
                #{index + 1}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-2 py-1 text-rose-700"
                title="Meh votes"
              >
                <span aria-hidden>😒</span> {factoid.votes_down}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-2 py-1 text-emerald-700"
                title="Mind blown votes"
              >
                <span aria-hidden>🤯</span> {factoid.votes_up}
              </span>
              {model && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--surface-card-border)] bg-[color:var(--surface-muted)] px-2 py-1 font-mono text-[color:var(--text-secondary)]"
                  title="Model that generated this factoid"
                >
                  <span aria-hidden>🤖</span> {model}
                </span>
              )}
            </div>
            <FactoidCard
              factoid={factoid}
              models={models}
              isAlternate={index % 2 === 1}
              colorIndex={index % 6}
            />
          </li>
        );
      })}
    </ol>
  );
}
