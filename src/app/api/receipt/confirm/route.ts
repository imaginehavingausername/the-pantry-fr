import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "~/server/db";
import { FOOD_CATEGORIES, type FoodCategoryName } from "~/lib/receiptGemini";

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
    const result = await prisma.$transaction(async (tx) => {
      // 1. Apply quantity increments to existing items.
      const updatedItems = await Promise.all(
        body.matched_items.map((m) =>
          tx.foodItem.update({
            where: { id: m.food_item_id },
            data: { quantity: { increment: m.quantity_delta } },
          })
        )
      );

      // 2. Create new items. Categories come from the fixed FOOD_CATEGORIES set, so we
      //    look them up by name rather than freely creating new category rows. If a
      //    category row doesn't exist yet (e.g. DB hasn't been seeded with all 8 yet),
      //    it's created on the fly with that exact name so nothing silently drops.
      const createdItems = [];
      for (const item of body.new_items) {
        const categoryConnections = [];
        for (const name of item.categories ?? []) {
          const category = await tx.foodCategory.upsert({
            where: { name },
            update: {},
            create: { name },
          });
          categoryConnections.push({ foodCategoryId: category.id });
        }

        const created = await tx.foodItem.create({
          data: {
            name: item.name,
            quantity: item.quantity,
            expirationDate: new Date(item.expirationDate),
            placement: item.placement,
            keywords: item.keywords ?? [],
            imageUrl: item.imageUrl ?? null,
            categories: {
              create: categoryConnections,
            },
          },
        });
        createdItems.push(created);
      }

      return { updatedItems, createdItems };
    });

    return NextResponse.json({
      updatedCount: result.updatedItems.length,
      createdCount: result.createdItems.length,
    });
  } catch (err) {
    console.error("Receipt confirm failed:", err);
    return NextResponse.json({ error: "Failed to apply pantry updates." }, { status: 500 });
  }
}