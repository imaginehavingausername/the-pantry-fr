// import next response which will be used to respond to the request frontend makes 
// import prisma client which will be used to query the database
import { NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';
import { auth } from "@clerk/nextjs/server";
import { UTApi } from "uploadthing/server";

// Singleton pattern for Prisma Client - prevents connection pool exhaustion
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Singleton for UTApi
const globalForUTApi = globalThis as unknown as {
  utapi: UTApi | undefined;
};

const utapi = globalForUTApi.utapi ?? new UTApi();

if (process.env.NODE_ENV !== 'production') globalForUTApi.utapi = utapi;

// Type definitions for request bodies
interface CreateFoodItemBody {
  name: string;
  expirationDate: string;
  quantity: number;
  imageUrl?: string | null;
  keywords?: string[];
  placement: string;
  categoryNames?: string[];
}

interface UpdateFoodItemBody {
  id: string;
  name?: string;
  expirationDate?: string;
  quantity?: number;
  imageUrl?: string | null;
  keywords?: string[];
  placement?: string;
  hidden?: boolean;
  categoryNames?: string[];
}

interface DeleteFoodItemBody {
  id: string;
}

// Helper function to extract file key from UploadThing URL
function extractFileKeyFromUrl(url: string): string | null {
  try {
    // UploadThing URLs typically look like: https://utfs.io/f/[FILE_KEY]
    const match = url.match(/\/f\/([^/?]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// Helper function to validate request body
function isValidCreateBody(body: unknown): body is CreateFoodItemBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.name === 'string' &&
    typeof b.expirationDate === 'string' &&
    typeof b.quantity === 'number' &&
    typeof b.placement === 'string'
  );
}

function isValidUpdateBody(body: unknown): body is UpdateFoodItemBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b.id === 'string';
}

function isValidDeleteBody(body: unknown): body is DeleteFoodItemBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b.id === 'string';
}

// Optimized select fields to reduce data transfer
const foodItemSelect = {
  id: true,
  name: true,
  expirationDate: true,
  quantity: true,
  imageUrl: true,
  keywords: true,
  placement: true,
  hidden: true,
  createdAt: true,
  updatedAt: true,
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

// export a function which will be called by the frontend
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // If no ID is provided, return all food items for the user
    if (!id) {
      const foodItems = await prisma.foodItem.findMany({
        where: {
          // Add user filtering here if you have a userId field in your foodItem model
          // userId: userId,
          hidden: false, // Only return non-hidden items
        },
        select: foodItemSelect,
        orderBy: {
          expirationDate: 'asc', // Order by expiration date, earliest first
        },
      });

      return NextResponse.json(foodItems, { status: 200 });
    }

    // If ID is provided, return the specific food item
    const foodItem = await prisma.foodItem.findUnique({
      where: {
        id: id,
      },
      select: foodItemSelect,
    });

    // check if the food item was found, if it wasn't then return a 404 error
    if (!foodItem) {
      return NextResponse.json({ error: 'Food item not found.' }, { status: 404 });
    }

    // return the food item as a json response
    return NextResponse.json(foodItem, { status: 200 });

  } catch (error) {
    console.error('Error fetching food item(s):', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
  // Removed finally block - let connection pooling handle it
}

// export a function which will be called by the frontend
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body: unknown = await request.json();

    if (!isValidCreateBody(body)) {
      return NextResponse.json({ error: 'Missing required fields: name, expirationDate, quantity, placement.' }, { status: 400 });
    }

    const { name, expirationDate, quantity, imageUrl, keywords, placement, categoryNames } = body;

    // Use transaction for atomic operations
    const newFoodItem = await prisma.$transaction(async (tx) => {
      return await tx.foodItem.create({
        data: {
          name,
          expirationDate: new Date(expirationDate),
          quantity,
          imageUrl: imageUrl || null,
          keywords: keywords ?? [],
          placement,
          categories: {
            create: categoryNames?.map((categoryName: string) => ({
              foodCategory: {
                connectOrCreate: {
                  where: { name: categoryName },
                  create: { name: categoryName },
                },
              },
            })) ?? [],
          },
        },
        select: foodItemSelect,
      });
    });

    return NextResponse.json(newFoodItem, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body: unknown = await request.json();

    if (!isValidUpdateBody(body)) {
      return NextResponse.json({ error: 'Food item ID is required for update.' }, { status: 400 });
    }

    const { id, name, expirationDate, quantity, imageUrl, keywords, placement, hidden, categoryNames } = body;

    const updateData: Prisma.FoodItemUpdateInput = {};

    if (name !== undefined) updateData.name = name;
    if (expirationDate !== undefined) updateData.expirationDate = new Date(expirationDate);
    if (quantity !== undefined) updateData.quantity = quantity;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (keywords !== undefined) updateData.keywords = keywords;
    if (placement !== undefined) updateData.placement = placement;
    if (hidden !== undefined) updateData.hidden = hidden;

    // Use transaction for category updates
    const updatedFoodItem = await prisma.$transaction(async (tx) => {
      if (categoryNames !== undefined) {
        // First, disconnect existing categories
        await tx.foodCategoryOnFoodItem.deleteMany({
          where: { foodItemId: id },
        });

        // Then, connect new or existing categories
        updateData.categories = {
          create: categoryNames.map((categoryName: string) => ({
            foodCategory: {
              connectOrCreate: {
                where: { name: categoryName },
                create: { name: categoryName },
              },
            },
          })),
        };
      }

      return await tx.foodItem.update({
        where: { id: id },
        data: updateData,
        select: foodItemSelect,
      });
    });

    return NextResponse.json(updatedFoodItem, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body: unknown = await request.json();

    if (!isValidDeleteBody(body)) {
      return NextResponse.json({ error: 'Food item ID is required for deletion.' }, { status: 400 });
    }

    const { id } = body;

    // Use transaction for atomic delete operation
    const result = await prisma.$transaction(async (tx) => {
      // First, get the food item to check if it has an image
      const existingItem = await tx.foodItem.findUnique({
        where: { id },
        select: { imageUrl: true }
      });

      if (!existingItem) {
        throw new Error('Food item not found');
      }

      // Delete the food item from database first
      const deletedFoodItem = await tx.foodItem.delete({
        where: { id: id },
        select: { id: true }
      });

      return { deletedFoodItem, imageUrl: existingItem.imageUrl };
    });

    // Delete the file from UploadThing asynchronously (don't wait for it)
    if (result.imageUrl) {
      const fileKey = extractFileKeyFromUrl(result.imageUrl);
      if (fileKey) {
        // Fire and forget - don't block the response
        utapi.deleteFiles([fileKey]).catch((error) => {
          console.warn('Failed to delete file from UploadThing:', error);
        });
      }
    }

    return NextResponse.json({
      message: 'Food item deleted successfully.',
      deletedId: result.deletedFoodItem.id
    }, { status: 200 });

  } catch (error) {
    console.error('Error deleting food item:', error);
    if (error instanceof Error && error.message === 'Food item not found') {
      return NextResponse.json({ error: 'Food item not found.' }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Food item not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}