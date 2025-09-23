import { GenerateFactoidForm } from "@/components/generate-factoid-form";
import { FactoidCard } from "@/components/factoid-card";
import { ThemeMenu } from "@/components/theme-menu";
import { fetchFactoids, fetchModels } from "@/lib/api";

export const revalidate = 0;

export default async function HomePage() {
  const [factoids, models] = await Promise.all([fetchFactoids(), fetchModels()]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold text-[color:var(--text-primary)]">
          Andy&apos;s Daily Factoids
        </h1>
        <ThemeMenu />
      </header>

      <GenerateFactoidForm models={models} />

      <section className="space-y-4">
        <div className="space-y-4">
          {factoids.map((factoid) => (
            <FactoidCard key={factoid.id} factoid={factoid} />
          ))}
          {factoids.length === 0 && (
            <p className="rounded-md border border-dashed border-[color:var(--surface-card-border)] p-6 text-center text-sm text-[color:var(--text-muted)]">
              No factoids yet. Generate one to get started!
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
