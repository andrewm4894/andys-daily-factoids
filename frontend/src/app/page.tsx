import Link from "next/link";

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
        <div className="flex items-center gap-3">
          <Link
            href="https://github.com/andrewm4894/andys-daily-factoids"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--surface-card-border)] bg-[color:var(--surface-card)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-secondary)] shadow-sm transition-colors hover:border-[color:var(--surface-card-border-hover)] hover:text-[color:var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-outline)]"
          >
            <span aria-hidden className="text-base">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.486 2 12.021c0 4.425 2.865 8.18 6.839 9.504.5.093.682-.218.682-.483 0-.237-.009-.868-.014-1.703-2.782.606-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.622.069-.61.069-.61 1.004.071 1.532 1.032 1.532 1.032.892 1.531 2.341 1.089 2.91.833.091-.647.35-1.09.636-1.341-2.22-.253-4.555-1.113-4.555-4.953 0-1.094.39-1.99 1.029-2.689-.104-.253-.446-1.27.098-2.647 0 0 .84-.27 2.75 1.027A9.564 9.564 0 0 1 12 6.844a9.56 9.56 0 0 1 2.508.337c1.909-1.296 2.748-1.027 2.748-1.027.546 1.377.204 2.394.1 2.647.64.699 1.028 1.595 1.028 2.689 0 3.85-2.338 4.697-4.566 4.944.36.31.679.92.679 1.853 0 1.336-.012 2.414-.012 2.741 0 .268.18.58.688.481A10.013 10.013 0 0 0 22 12.02C22 6.486 17.523 2 12 2Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <span className="hidden sm:inline">GitHub</span>
            <span className="sm:hidden">Repo</span>
          </Link>
          <ThemeMenu />
        </div>
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
