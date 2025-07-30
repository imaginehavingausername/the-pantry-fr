// import next response which will be used to respond to the request frontend makes 
// import prisma client which will be used to query the database
import { NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';
import { auth } from "@clerk/nextjs/server";
import { UTApi } from "uploadthing/server";

// make a variable which has everything about our db connection
const prisma = new PrismaClient();
const utapi = new UTApi();

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
    return match ? match[1] : null
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

// export a function which will be called by the frontend
export async function GET(request: Request) {
  const { userId } = await auth() 
  if (!userId) { 
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // try catch block to handle errors
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
        include: {
          categories: {
            include: {
              foodCategory: true,
            },
          },
        },
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
      include: {
        categories: {
          include: {
            foodCategory: true,
          },
        },
      },
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
  } finally {
    await prisma.$disconnect();
  }
}

// export a function which will be called by the frontend
export async function POST(request: Request) {
  // try catch block to handle errors
  try {
    const { userId } = await auth() 
    if (!userId) { 
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body: unknown = await request.json();

    if (!isValidCreateBody(body)) {
      return NextResponse.json({ error: 'Missing required fields: name, expirationDate, quantity, placement.' }, { status: 400 });
    }

    const { name, expirationDate, quantity, imageUrl, keywords, placement, categoryNames } = body;

    // create a variable to hold the new food item
    const newFoodItem = await prisma.foodItem.create({
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
      include: {
        categories: {
          include: {
            foodCategory: true,
          },
        },
      },
    });

    // return the new food item as a json response
    return NextResponse.json(newFoodItem, { status: 201 });
    // catch any errors that occur during the execution of the above code
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    // finally, make sure to close the database connection
  } finally {
    await prisma.$disconnect();
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth() 
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

    if (categoryNames !== undefined) {
      // First, disconnect existing categories
      await prisma.foodCategoryOnFoodItem.deleteMany({
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

    const updatedFoodItem = await prisma.foodItem.update({
      where: { id: id },
      data: updateData,
      include: {
        categories: {
          include: {
            foodCategory: true,
          },
        },
      },
    });

    return NextResponse.json(updatedFoodItem, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth() 
    if (!userId) { 
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body: unknown = await request.json();

    if (!isValidDeleteBody(body)) {
      return NextResponse.json({ error: 'Food item ID is required for deletion.' }, { status: 400 });
    }

    const { id } = body;

    // First, get the food item to check if it has an image
    const existingItem = await prisma.foodItem.findUnique({
      where: { id },
      select: { imageUrl: true }
    });

    if (!existingItem) {
      return NextResponse.json({ error: 'Food item not found.' }, { status: 404 });
    }

    // Delete the file from UploadThing if it exists
    if (existingItem.imageUrl) {
      try {
        const fileKey = extractFileKeyFromUrl(existingItem.imageUrl);
        if (fileKey) {
          await utapi.deleteFiles([fileKey]);
          console.log(`Successfully deleted file with key: ${fileKey}`);
        }
      } catch (fileDeleteError) {
        console.warn('Failed to delete file from UploadThing:', fileDeleteError);
        // Continue with database deletion even if file deletion fails
        // This prevents orphaned database records
      }
    }

    // Delete the food item from database
    const deletedFoodItem = await prisma.foodItem.delete({
      where: { id: id },
    });

    return NextResponse.json({ 
      message: 'Food item and associated file deleted successfully.', 
      deletedId: deletedFoodItem.id 
    }, { status: 200 });

  } catch (error) {
    console.error('Error deleting food item:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Food item not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}