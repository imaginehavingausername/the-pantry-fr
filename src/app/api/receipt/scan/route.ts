import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "~/server/db";
import {
  getGenAI,
  RECEIPT_MODEL,
  receiptResponseSchema,
  buildReceiptPrompt,
  type ReceiptScanResult,
} from "~/lib/receiptGemini"; // resolves to src/lib/receiptGemini.ts if your tsconfig maps @/* -> src/*

export const runtime = "nodejs"; // Gemini SDK needs Node runtime, not edge
export const maxDuration = 30; // seconds; well under Gemini's typical response time, adjust if needed

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB/image sanity cap, keeps total request well under Vercel's body limit

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("images").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "No images provided." }, { status: 400 });
    }
    if (files.length > MAX_IMAGES) {
      return NextResponse.json({ error: `Too many images (max ${MAX_IMAGES}).` }, { status: 400 });
    }
    for (const file of files) {
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: `Image "${file.name}" is too large. Resize before uploading.` },
          { status: 400 }
        );
      }
    }

    // Pull a lean pantry item list for the prompt — only what Gemini needs to match against.
    const pantryItems = await prisma.foodItem.findMany({
      where: { hidden: false },
      select: { id: true, name: true, keywords: true },
    });

    // Convert uploaded images to the inline-data parts Gemini expects.
    const imageParts = await Promise.all(
      files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        return {
          inlineData: {
            mimeType: file.type || "image/jpeg",
            data: base64,
          },
        };
      })
    );

    const prompt = buildReceiptPrompt(pantryItems);

    const response = await getGenAI().models.generateContent({
      model: RECEIPT_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, ...imageParts],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: receiptResponseSchema,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json({ error: "Gemini returned an empty response." }, { status: 502 });
    }

    let parsed: ReceiptScanResult;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Gemini response was not valid JSON." }, { status: 502 });
    }

    // Basic shape validation beyond what the schema already enforced server-side by Gemini.
    if (
      !Array.isArray(parsed.matched_items) ||
      !Array.isArray(parsed.new_items) ||
      !Array.isArray(parsed.unmatched_lines)
    ) {
      return NextResponse.json({ error: "Gemini response had an unexpected shape." }, { status: 502 });
    }

    // Cross-check matched_items ids actually exist, in case Gemini hallucinates one.
    const validIds = new Set(pantryItems.map((p) => p.id));
    const cleanedMatches = parsed.matched_items.filter((m) => validIds.has(m.food_item_id));
    const droppedMatches = parsed.matched_items.length - cleanedMatches.length;
    if (droppedMatches > 0) {
      parsed.unmatched_lines.push(
        ...parsed.matched_items
          .filter((m) => !validIds.has(m.food_item_id))
          .map((m) => ({
            raw_text: m.name,
            reason: "Matched to an item id that doesn't exist — needs manual review.",
          }))
      );
    }
    parsed.matched_items = cleanedMatches;

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Receipt scan failed:", err);
    return NextResponse.json({ error: "Receipt scan failed. Please try again." }, { status: 500 });
  }
}