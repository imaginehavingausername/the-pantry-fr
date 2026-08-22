import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // adjust to your actual Prisma singleton path
import { FOOD_CATEGORIES, FoodCategoryName } from "@/lib/receiptGemini";

export const runtime = "nodejs";

// What the review page sends back after the user edits/confirms.
interface ConfirmedMatchedItem {
  food_item_id: string;
  quantity_delta: number;
}

interface ConfirmedNewItem {
  name: string;
  quantity: number;
  expirationDate: string; // ISO date string — REQUIRED, user fills this in on the review page
  placement: string; // REQUIRED, user fills this in on the review page
  categories: FoodCategoryName[]; // must be a subset of FOOD_CATEGORIES
  keywords: string[];
  imageUrl?: string; // from UploadThing, already uploaded by the time this hits confirm
}

interface ConfirmBody {
  matched_items: ConfirmedMatchedItem[];
  new_items: ConfirmedNewItem[];
}

export async function POST(req: NextRequest) {
  let body: ConfirmBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.matched_items) || !Array.isArray(body.new_items)) {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  // Validate the required fields Gemini can't fill in, since the DB schema requires them.
  for (const item of body.new_items) {
    if (!item.name || !item.quantity || !item.expirationDate || !item.placement) {
      return NextResponse.json(
        { error: `New item "${item.name || "(unnamed)"}" is missing a required field (expirationDate/placement/quantity).` },
        { status: 400 }
      );
    }
    const invalidCategories = (item.categories ?? []).filter(
      (c) => !FOOD_CATEGORIES.includes(c)
    );
    if (invalidCategories.length > 0) {
      return NextResponse.json(
        { error: `New item "${item.name}" has unrecognized categories: ${invalidCategories.join(", ")}` },
        { status: 400 }
      );
    }
  }

  try {
    // Resolve every distinct category name used across new_items to a FoodCategory id
    // BEFORE opening the transaction. Categories come from the fixed, tiny
    // FOOD_CATEGORIES set, so this is at most 8 upserts, done once, outside the
    // transaction's timeout window — not once per item inside it. This is what was
    // actually blowing the 5s interactive-transaction timeout: N items x M categories
    // each as a separate round-trip upsert INSIDE the transaction.
    const distinctCategoryNames = Array.from(
      new Set(body.new_items.flatMap((item) => item.categories ?? []))
    );
    const categoryRecords = await Promise.all(
      distinctCategoryNames.map((name) =>
        prisma.foodCategory.upsert({ where: { name }, update: {}, create: { name } })
      )
    );
    const categoryIdByName = new Map(categoryRecords.map((c: any) => [c.name, c.id]));

    const result = await prisma.$transaction(
      async (tx: any) => {
        // 1. Apply quantity increments to existing items.
        const updatedItems = await Promise.all(
          body.matched_items.map((m) =>
            tx.foodItem.update({
              where: { id: m.food_item_id },
              data: { quantity: { increment: m.quantity_delta } },
            })
          )
        );

        // 2. Create new items in parallel — category ids are already resolved above,
        //    so each create is a single fast insert (+ junction rows), no per-item
        //    network round trip to resolve a category first.
        const createdItems = await Promise.all(
          body.new_items.map((item) =>
            tx.foodItem.create({
              data: {
                name: item.name,
                quantity: item.quantity,
                expirationDate: new Date(item.expirationDate),
                placement: item.placement,
                keywords: item.keywords ?? [],
                imageUrl: item.imageUrl ?? null,
                categories: {
                  create: (item.categories ?? [])
                    .map((name) => categoryIdByName.get(name))
                    .filter((id): id is string => Boolean(id))
                    .map((foodCategoryId) => ({ foodCategoryId })),
                },
              },
            })
          )
        );

        return { updatedItems, createdItems };
      },
      // Safety net on top of the real fix above — even fast queries can occasionally
      // queue behind a slow Neon connection, so give real headroom rather than relying
      // on Prisma's 5s default.
      { timeout: 20_000, maxWait: 10_000 }
    );

    return NextResponse.json({
      updatedCount: result.updatedItems.length,
      createdCount: result.createdItems.length,
    });
  } catch (err) {
    console.error("Receipt confirm failed:", err);
    return NextResponse.json({ error: "Failed to apply pantry updates." }, { status: 500 });
  }
}