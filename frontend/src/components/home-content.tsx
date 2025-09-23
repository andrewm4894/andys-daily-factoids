"use client";

import { useEffect, useState } from "react";

import { GenerateFactoidForm } from "@/components/generate-factoid-form";
import { FactoidCard } from "@/components/factoid-card";
import type { Factoid } from "@/lib/types";

interface HomeContentProps {
  initialFactoids: Factoid[];
  models: string[];
}

function shuffleFactoids(factoids: Factoid[]): Factoid[] {
  const shuffled = [...factoids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

export function HomeContent({ initialFactoids, models }: HomeContentProps) {
  const [factoids, setFactoids] = useState<Factoid[]>(initialFactoids);

  useEffect(() => {
    setFactoids(initialFactoids);
  }, [initialFactoids]);

  const handleShuffle = () => {
    if (factoids.length <= 1) {
      return;
    }
    setFactoids((previous) => shuffleFactoids(previous));
  };

  return (
    <div className="space-y-6">
      <GenerateFactoidForm models={models} onShuffle={handleShuffle} />

      <section className="space-y-4">
        {factoids.map((factoid, index) => (
          <FactoidCard
            key={factoid.id}
            factoid={factoid}
            isAlternate={index % 2 === 1}
            colorIndex={index % 6}
          />
        ))}
        {factoids.length === 0 && (
          <p className="rounded-md border border-dashed border-[color:var(--surface-card-border)] p-6 text-center text-sm text-[color:var(--text-muted)]">
            No factoids yet. Generate one to get started!
          </p>
        )}
      </section>
    </div>
  );
}
