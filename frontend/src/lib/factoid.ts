import type { Factoid } from "@/lib/types";

/** Return the model key that generated a factoid, if it is recorded. */
export function getFactoidModel(factoid: Factoid): string | null {
  const metadata = factoid.generation_metadata;
  if (metadata && typeof metadata === "object") {
    const model = (metadata as Record<string, unknown>).model;
    if (typeof model === "string" && model.trim() !== "") {
      return model.trim();
    }
  }
  return null;
}
