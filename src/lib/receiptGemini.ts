import { GoogleGenAI, Type } from "@google/genai";

// Lazy getter — keeps the API key out of client bundles when the module is 
// imported for types/constants only. Call this from server-side code (e.g. an API route).
export function getGenAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export const RECEIPT_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
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
   - your best reading of a clean product name
   - the quantity purchased
   - suggested_categories: zero or more categories from the ALLOWED CATEGORIES list above that fit this item (a food can fit more than one, e.g. a bag of frozen peas might be both "Dinner" and "Veggie" — use your judgment, and it's fine to return an empty array if nothing fits well)
   - suggested_keywords: useful search terms for this item — brand name if visible on the receipt/packaging, descriptors like "organic", "gallon", "low-fat", and common alternate/casual names a person might search for it by (e.g. "cookies" for a box of Oreos)
   - your confidence
   Do not invent items that are not on the receipt.
4. If a line is illegible, ambiguous, or clearly not a product (and doesn't fit new_items either), add it to unmatched_lines with the raw text and a short reason.
5. If the same product appears on multiple receipt photos (e.g. a receipt that spans two photos), do not double-count it.
6. Ignore any non-food items such as household items, cleaning supplies, or toiletries.
7. Quantities: if a receipt line shows a pack/multipack count, use that as the quantity. If unclear, default to 1.
8. Respond ONLY with JSON matching the required schema. Do not include markdown formatting or commentary.`;
}