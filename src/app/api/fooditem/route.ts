// import next response which will be used to respond to the request frontend makes 
// import prisma client which will be used to query the database
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// make a variable which has everything about our db connection
const prisma = new PrismaClient();

// export a function which will be called by the frontend
export async function GET(request: Request) {
    // try catch block to handle errors
  try {
    // create a new instance of the prisma client
    // use prisma client to query the database
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id'); 

    // check if the id is present in the url, if not then return a error response
    if (!id) {
      return NextResponse.json({ error: 'Food item ID is required as a query parameter (e.g., ?id=YOUR_ID).' }, { status: 400 });
    }

    // use prisma client to query the database for the food item with the given id
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

    //check if the food item was found, if it wasn't then return a 404 error
    if (!foodItem) {
      return NextResponse.json({ error: 'Food item not found.' }, { status: 404 });
    }

    // return the food item as a json response
    return NextResponse.json(foodItem, { status: 200 });

    // catch any errors that occur during the execution of the above code
  } catch (error) {
    console.error('Error fetching food item:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    // finally, make sure to close the database connection
  } finally {
    await prisma.$disconnect();
  }
}
// export a function which will be called by the frontend
export async function POST(request: Request) {
    // try catch block to handle errors
  try {
    const body = await request.json();
    const { name, expirationDate, quantity, imageUrl, keywords, placement, categoryNames } = body;

    // check if all the required fields are present in the request body
    if (!name || !expirationDate || !quantity || !placement) {
      return NextResponse.json({ error: 'Missing required fields: name, expirationDate, quantity, placement.' }, { status: 400 });
    }

    // create a variable to hold the new food item
    const newFoodItem = await prisma.foodItem.create({
      data: {
        name,
        expirationDate: new Date(expirationDate),
        quantity,
        imageUrl,
        keywords: keywords || [],
        placement,
        categories: {
          create: categoryNames?.map((categoryName: string) => ({
            foodCategory: {
              connectOrCreate: {
                where: { name: categoryName },
                create: { name: categoryName },
              },
            },
          })),
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
    const body = await request.json();
    const { id, name, expirationDate, quantity, imageUrl, keywords, placement, hidden, categoryNames } = body;

    if (!id) {
      return NextResponse.json({ error: 'Food item ID is required for update.' }, { status: 400 });
    }

    const updateData: {
      name?: string;
      expirationDate?: Date;
      quantity?: number;
      imageUrl?: string;
      keywords?: string[];
      placement?: string;
      hidden?: boolean;
      categories?: any; // Prisma will handle this structure
    } = {};

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
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Food item ID is required for deletion.' }, { status: 400 });
    }

    const deletedFoodItem = await prisma.foodItem.delete({
      where: { id: id },
    });

    return NextResponse.json({ message: 'Food item deleted successfully.', deletedId: deletedFoodItem.id }, { status: 200 });
  } catch (error) {
    console.error(error);
    if (error instanceof Error && (error as any).code === 'P2025') { // Prisma error code for record not found
      return NextResponse.json({ error: 'Food item not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
