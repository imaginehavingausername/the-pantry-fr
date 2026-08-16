import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma Client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Alexa-specific API endpoints for Nedell Pantry.
 * Authenticated via ALEXA_API_KEY passed in the Authorization header.
 * Designed to be called from an Alexa-hosted Lambda (requires public HTTPS).
 */

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

/**
 * Format a food item into the Alexa-friendly response shape.
 */
function formatItem(item: any): any {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    expiration: item.expirationDate.toISOString().split('T')[0],
    categories: item.categories.map((c: any) => c.foodCategory.name),
    placement: item.placement,
    keywords: item.keywords || [],
  };
}

/**
 * Flexible text matching: check if a query string matches an item
 * by name or any of its keywords (case-insensitive).
 */
function itemMatchesQuery(item: any, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  const nameMatch = item.name.toLowerCase().includes(q);
  const keywordMatch = (item.keywords || []).some(
    (kw: string) => kw.toLowerCase().includes(q)
  );

  return nameMatch || keywordMatch;
}

// Optimized select for full item retrieval
const foodItemSelect = {
  id: true,
  name: true,
  expirationDate: true,
  quantity: true,
  imageUrl: true,
  keywords: true,
  placement: true,
  hidden: true,
  categories: {
    select: {
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
 * GET /api/pantry/items?q=search_term — search or list all items
 * GET /api/pantry/items?category=breakfast&count=3 — random selection
 */
export async function GET(request: Request) {
  if (!authenticateAlexa(request)) return unauthenticatedResponse();

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const category = searchParams.get('category');
    const countParam = searchParams.get('count');
    const count = countParam ? Math.min(Math.max(parseInt(countParam, 10), 1), 20) : undefined;

    // Random selection mode
    if (category && count !== undefined) {
      const items = await prisma.foodItem.findMany({
        where: {
          hidden: false,
          categories: {
            some: {
              foodCategory: {
                name: { mode: 'insensitive', equals: category },
              },
            },
          },
        },
        select: foodItemSelect,
      });

      // Shuffle and pick N
      const shuffled = items.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, count);

      return NextResponse.json({
        items: selected.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          expiration: item.expirationDate.toISOString().split('T')[0],
          categories: item.categories.map((c: any) => c.foodCategory.name),
          placement: item.placement,
          keywords: item.keywords || [],
        })),
      });
    }

    // Search or list all
    const items = await prisma.foodItem.findMany({
      where: { hidden: false },
      select: foodItemSelect,
      orderBy: { expirationDate: 'asc' },
    });

    if (q) {
      // Filter by query (name or keywords)
      const matches = items.filter((item) => itemMatchesQuery(item, q));

      return NextResponse.json({
        matches: matches.map((item) => formatItem(item)),
      });
    }

    // List all items
    return NextResponse.json({
      items: items.map((item) => formatItem(item)),
    });
  } catch (error) {
    console.error('Error fetching pantry items:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/pantry/items — add a new item
 * Body: { name: string, quantity?: number, placement?: string, expirationDate?: string, keywords?: string[], categoryNames?: string[] }
 */
export async function POST(request: Request) {
  if (!authenticateAlexa(request)) return unauthenticatedResponse();

  try {
    const body = await request.json();
    const { name, quantity = 1, placement = 'pantry', expirationDate, keywords = [], categoryNames = [] } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Item name is required.' }, { status: 400 });
    }

    // Default expiration: 14 days from now if not provided
    const expDate = expirationDate ? new Date(expirationDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const newFoodItem = await prisma.$transaction(async (tx) => {
      return await tx.foodItem.create({
        data: {
          name: name.trim(),
          expirationDate: expDate,
          quantity,
          keywords,
          placement,
          categories: {
            create: categoryNames.map((categoryName: string) => ({
              foodCategory: {
                connectOrCreate: {
                  where: { name: categoryName },
                  create: { name: categoryName },
                },
              },
            })),
          },
        },
        select: foodItemSelect,
      });
    });

    return NextResponse.json({ item: formatItem(newFoodItem) }, { status: 201 });
  } catch (error) {
    console.error('Error adding pantry item:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
