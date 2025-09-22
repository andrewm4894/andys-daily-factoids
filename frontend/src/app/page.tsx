import { GenerateFactoidForm } from "@/components/generate-factoid-form";
import { RateLimitBanner } from "@/components/rate-limit-banner";
import { FactoidCard } from "@/components/factoid-card";
import { fetchFactoids, fetchModels } from "@/lib/api";

export const revalidate = 0;

export default async function HomePage() {
  const [factoids, models] = await Promise.all([fetchFactoids(), fetchModels()]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Andy&apos;s Daily Factoids</h1>
        <p className="text-sm text-slate-600">
          Generate mind-blowing factoids, vote on your favourites, and share feedback to shape future
          generations.
        </p>
      </header>

      <RateLimitBanner />

      <GenerateFactoidForm models={models} />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Latest factoids</h2>
        <div className="space-y-4">
          {factoids.map((factoid) => (
            <FactoidCard key={factoid.id} factoid={factoid} />
          ))}
          {factoids.length === 0 && (
            <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No factoids yet. Generate one to get started!
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
