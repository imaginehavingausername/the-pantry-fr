import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma Client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Alexa-specific API for individual pantry item operations.
 * Authenticated via ALEXA_API_KEY in the Authorization header.
 */

// --- Types ---

interface FormattedPantryItem {
  id: string;
  name: string;
  quantity: number;
  expiration: string;
  categories: string[];
  placement: string;
  keywords: string[];
}

interface PrismaFoodItemResult {
  id: string;
  name: string;
  quantity: number;
  expirationDate: Date;
  placement: string;
  keywords: string[] | null;
  categories: Array<{
    foodCategory: { name: string };
  }>;
}

// --- Helpers ---

function authenticateAlexa(request: Request): boolean {
  const apiKey = process.env.ALEXA_API_KEY;

  if (!apiKey) {
    console.error('ALEXA_API_KEY is not set in environment variables.');
    return false;
    }

  const authHeader = request.headers.get('Authorization');
  return authHeader === `Bearer ${apiKey}`;
}

function unauthenticatedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function formatItem(item: PrismaFoodItemResult): FormattedPantryItem {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    expiration: item.expirationDate.toISOString().split('T')[0],
    categories: item.categories.map((c) => c.foodCategory.name),
      foodCategory: {
        select: {
          id: true,
          name: true,
         },
       },
     },
   },
};

// --- Route Handlers ---

/**
 * GET /api/pantry/items/{id} — get a single item by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authenticateAlexa(request)) return unauthenticatedResponse();

  try {
    const { id } = await params;

    const item = await prisma.foodItem.findUnique({
      where: { id },
      select: foodItemSelect,
     });

    if (!item) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
     }

    return NextResponse.json({ item: formatItem(item) });
   } catch (error) {
    console.error('Error fetching pantry item:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
   }
}

/**
 * PATCH /api/pantry/items/{id} — update an existing item
 * Body can include any subset of: name, quantity, placement, expirationDate, keywords, categoryNames
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authenticateAlexa(request)) return unauthenticatedResponse();

  try {
    const { id } = await params;

     // Verify item exists first
    const existing = await prisma.foodItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
     }

    const body = await request.json();
    const { name, quantity, placement, expirationDate, keywords, categoryNames } = body;

    const updateData: any = {};

    if (name !== undefined && typeof name === 'string') updateData.name = name.trim();
    if (quantity !== undefined && typeof quantity === 'number') updateData.quantity = quantity;
    if (placement !== undefined && typeof placement === 'string') updateData.placement = placement;
    if (expirationDate !== undefined) updateData.expirationDate = new Date(expirationDate);
    if (keywords !== undefined && Array.isArray(keywords)) updateData.keywords = keywords;

     // Handle category updates via transaction
    const updatedItem = await prisma.$transaction(async (tx) => {
      if (categoryNames !== undefined && Array.isArray(categoryNames)) {
         // Delete existing category associations
        await tx.foodCategoryOnFoodItem.deleteMany({
          where: { foodItemId: id },
         });

         // Create new associations
        updateData.categories = {
          create: categoryNames.map((cn: string) => ({
            foodCategory: {
              connectOrCreate: {
                where: { name: cn },
                create: { name: cn },
               },
             },
           })),
         };
       }

      return await tx.foodItem.update({
        where: { id },
        data: updateData,
        select: foodItemSelect,
       });
     });

    return NextResponse.json({ item: formatItem(updatedItem) });
   } catch (error) {
    console.error('Error updating pantry item:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
   }
}

/**
 * DELETE /api/pantry/items/{id} — remove an item from the pantry
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authenticateAlexa(request)) return unauthenticatedResponse();

  try {
    const { id } = await params;

    const existing = await prisma.foodItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
     }

    await prisma.foodItem.delete({ where: { id } });

    return NextResponse.json({ message: 'Item removed successfully.', id }, { status: 200 });
   } catch (error) {
    console.error('Error deleting pantry item:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
   }
}
