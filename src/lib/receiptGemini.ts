import { GoogleGenAI, Type } from "@google/genai";

// Lazy getter — keeps the API key out of client bundles when the module is 
// imported for types/constants only. Call this from server-side code (e.g. an API route).
export function getGenAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export const RECEIPT_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
] as const;

export const RECEIPT_MODEL = RECEIPT_MODELS[0];

// Fixed set of FoodCategory names that exist in the DB. Keep this in sync with
// whatever rows actually exist in FoodCategory — if you add/rename categories there,
// update this list too.
export const FOOD_CATEGORIES = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Dessert",
  "Main",
  "Veggie",
  "Starch",
] as const;

export type FoodCategoryName = (typeof FOOD_CATEGORIES)[number];

// ---- Types matching the structured output we force Gemini to return ----

export interface MatchedItem {
  food_item_id: string;
  name: string; // Gemini's read of the item name, for display/sanity-check
  quantity_delta: number; // how many more of this item were bought
  confidence: "high" | "medium" | "low";
}

export interface NewItem {
  name: string;
  quantity: number;
  suggested_categories: FoodCategoryName[]; // zero or more, from the fixed list
  suggested_keywords: string[]; // brand names, descriptors, alternate names, etc.
  confidence: "high" | "medium" | "low";
}

export interface UnmatchedLine {
  raw_text: string;
  reason: string;
}

export interface ReceiptScanResult {
  matched_items: MatchedItem[];
  new_items: NewItem[];
  unmatched_lines: UnmatchedLine[];
}

// JSON schema handed to Gemini via responseSchema so we get guaranteed shape back
// instead of parsing free-form text.
export const receiptResponseSchema = {
  type: Type.OBJECT,
  properties: {
    matched_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          food_item_id: {
            type: Type.STRING,
            description: "The id of the existing pantry item this receipt line matches, copied exactly from the provided pantry list.",
          },
          name: { type: Type.STRING },
          quantity_delta: {
            type: Type.INTEGER,
            description: "How many additional units of this item were purchased, based on the receipt.",
          },
          confidence: {
            type: Type.STRING,
            enum: ["high", "medium", "low"],
          },
        },
        required: ["food_item_id", "name", "quantity_delta", "confidence"],
      },
    },
    new_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.INTEGER },
          suggested_categories: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              enum: [...FOOD_CATEGORIES],
            },
            description: "Zero or more categories this item likely belongs to, chosen ONLY from the allowed list.",
          },
          suggested_keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Useful search keywords for this item: brand name, descriptors (e.g. 'organic', 'gallon', 'low-fat'), and common alternate names (e.g. 'cookies' for Oreos).",
          },
          confidence: {
            type: Type.STRING,
            enum: ["high", "medium", "low"],
          },
        },
        required: ["name", "quantity", "suggested_categories", "suggested_keywords", "confidence"],
      },
    },
    unmatched_lines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          raw_text: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ["raw_text", "reason"],
      },
    },
  },
  required: ["matched_items", "new_items", "unmatched_lines"],
};

// ---- Fallback across RECEIPT_MODELS with a hard per-attempt timeout and an ----
// ---- overall time budget, so sequential retries can never exceed the ----
// ---- Vercel function's maxDuration and leave it to be killed mid-request. ----

interface GenerateWithFallbackArgs {
  contents: Parameters<ReturnType<typeof getGenAI>["models"]["generateContent"]>[0]["contents"];
  config: Parameters<ReturnType<typeof getGenAI>["models"]["generateContent"]>[0]["config"];
  models?: readonly string[];
  imageCount?: number; // number of images being scanned, used to scale timeouts
}

export interface FallbackAttemptError {
  model: string;
  message: string;
}

export class ReceiptGenerationError extends Error {
  attempts: FallbackAttemptError[];
  constructor(attempts: FallbackAttemptError[]) {
    super(`All Gemini models failed: ${attempts.map((a) => `${a.model} (${a.message})`).join("; ")}`);
    this.attempts = attempts;
  }
}

export async function generateWithFallback({
  contents,
  config,
  models = RECEIPT_MODELS,
  imageCount = 1,
}: GenerateWithFallbackArgs) {
  // Scale per-attempt timeout and total budget dynamically based on image count.
  // E.g. base 20s + 6s per additional image, with a generous total budget under the 60s maxDuration.
  // Use a larger per-attempt timeout to tolerate temporary slowdowns,
  // while keeping the overall budget safely under the function maxDuration.
  const perAttemptTimeoutMs = Math.min(45_000, 30_000 + Math.max(0, imageCount - 1) * 8_000);
  const totalBudgetMs = Math.min(55_000, 45_000 + Math.max(0, imageCount - 1) * 8_000);

  const genAI = getGenAI();
  const attempts: FallbackAttemptError[] = [];

  // Start one request per model in parallel and use the first successful one.
  // Each attempt has its own AbortController and timeout so we can cancel
  // remaining requests as soon as one succeeds.
  const controllers: Record<string, AbortController> = {};
  const timers: Record<string, NodeJS.Timeout> = {};

  const attemptPromises = models.map((model) => {
    const controller = new AbortController();
    controllers[model] = controller;

    // per-model attempt timeout — keep it bounded by total budget
    const attemptTimeout = Math.min(perAttemptTimeoutMs, totalBudgetMs);
    const timer = setTimeout(() => controller.abort(), attemptTimeout);
    timers[model] = timer;

    const attempt = (async () => {
      try {
        const p = genAI.models.generateContent({
          model,
          contents,
          config: {
            ...config,
            abortSignal: controller.signal,
          },
        });

        const hardTimeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`hard timeout after ${attemptTimeout}ms`)), attemptTimeout)
        );

        const response = await Promise.race([p, hardTimeoutPromise]);
        clearTimeout(timer);
        return { response, model } as const;
      } catch (err) {
        clearTimeout(timer);
        const message =
          controller.signal.aborted
            ? `timed out after ${attemptTimeout}ms`
            : err instanceof Error
              ? err.message
              : String(err);
        // bubble up failure so Promise.any can continue to wait for others
        throw { model, message };
      }
    })();

    return attempt;
  });

  try {
    const { response, model } = await Promise.any(attemptPromises);
    // Cancel other in-flight requests
    for (const m of models) {
      if (m !== model) {
        try {
          controllers[m]?.abort();
          clearTimeout(timers[m]);
        } catch {}
      }
    }
    return { response, modelUsed: model, attempts };
  } catch (aggErr) {
    // All attempts failed — gather error details from settled promises
    const settled = await Promise.allSettled(attemptPromises);
    for (const s of settled) {
      if (s.status === "rejected") {
        const reason = s.reason as { model?: string; message?: string } | Error | string;
        if (typeof reason === "object" && reason !== null && "model" in reason) {
          attempts.push({ model: (reason as any).model, message: (reason as any).message });
        } else if (s.status === "rejected") {
          const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
          attempts.push({ model: "unknown", message: msg });
        }
      }
    }

    throw new ReceiptGenerationError(attempts);
  } finally {
    // ensure all timers/controllers are cleaned up
    for (const m of models) {
      try {
        controllers[m]?.abort();
      } catch {}
      try {
        clearTimeout(timers[m]);
      } catch {}
    }
  }
}

export function buildReceiptPrompt(pantryItems: { id: string; name: string; keywords: string[] }[]) {
  return `You are parsing a grocery store receipt (one or more photos of the same receipt) to update a home pantry-tracking database.

You are given a list of the household's EXISTING pantry items below, as JSON. Each has an "id" you must copy exactly if you match a receipt line to it.

EXISTING PANTRY ITEMS:
${JSON.stringify(pantryItems)}

ALLOWED CATEGORIES (use ONLY these, exactly as spelled, for suggested_categories): ${FOOD_CATEGORIES.join(", ")}

Instructions:
1. Read every purchasable product line on the receipt (ignore subtotals, tax, totals, sales, coupons, loyalty point lines, and store info).
2. For each product line, try to match it to one existing pantry item by name/keywords, allowing for receipts' abbreviated or truncated product names (e.g. "ORG BANANA" -> "Organic Bananas"). If matched, add it to matched_items with the item's exact "id", the quantity purchased as quantity_delta, and your confidence.
3. If a line does NOT reasonably match any existing item, add it to new_items with:
   - your best reading of a clean, simple product name (do not include extra words such as organic, these go in keywords)
   - the quantity purchased
   - suggested_categories: zero or more categories from the ALLOWED CATEGORIES list above that fit this item (a food can fit more than one, e.g. a bag of frozen peas might be both "Dinner" and "Veggie" — use your judgment, and it's fine to return an empty array if nothing fits well)
   - suggested_keywords: useful search terms for this item — brand name if visible on the receipt/packaging, descriptors like "organic", "gallon", "low-fat", and common alternate/casual names a person might search for it by (e.g. "cookies" for a box of Oreos)
   - your confidence
   Do not invent items that are not on the receipt.
4. If a line is illegible, ambiguous, or clearly not a kitchen item (and doesn't fit new_items either), add it to unmatched_lines with the raw text and a short reason.
5. If the same product appears on multiple receipt photos (e.g. a receipt that spans two photos), do not double-count it.
6. Ignore any non-food items such as household items, cleaning supplies, or toiletries.
7. Ignore any meat/seafood items from the meat counter or seafood counter that are not pre-packaged. Pre-packaged meat/seafood is fine.
8. Quantities: if a receipt line shows a pack/multipack count, use that as the quantity. If unclear, default to 1.
9. Respond ONLY with JSON matching the required schema. Do not include markdown formatting or commentary.`;
}