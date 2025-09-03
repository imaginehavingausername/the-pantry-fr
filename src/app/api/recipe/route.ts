import { NextResponse } from 'next/server';
import { auth } from "@clerk/nextjs/server";

// Define the API key from environment variables
const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;

// Type definitions for the API response from Spoonacular
interface SpoonacularRecipe {
  id: number;
  title: string;
  image: string;
  imageType: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  missedIngredients: Ingredient[];
  usedIngredients: Ingredient[];
  unusedIngredients: Ingredient[];
  likes: number;
}

interface Ingredient {
  id: number;
  amount: number;
  unit: string;
  unitLong: string;
  unitShort: string;
  aisle: string;
  name: string;
  original: string;
  originalName: string;
  meta: string[];
  image: string;
}

// Helper function to validate the request body for POST
function isValidIngredientsBody(body: unknown): body is { ingredients: string[] } {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    Array.isArray(b.ingredients) &&
    b.ingredients.every(item => typeof item === 'string')
  );
}

// export a function which will be called by the frontend
export async function POST(request: Request) {
  // Authentication check using Clerk
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check for the API key
  if (!SPOONACULAR_API_KEY) {
    console.error('SPOONACULAR_API_KEY is not set in environment variables.');
    return NextResponse.json({ error: 'Internal Server Error: API key not configured.' }, { status: 500 });
  }

  try {
    const body: unknown = await request.json();

    if (!isValidIngredientsBody(body)) {
      return NextResponse.json({ error: 'Invalid request body. An array of ingredients is required.' }, { status: 400 });
    }

    const { ingredients } = body;

    // Join ingredients into a comma-separated string
    const ingredientsString = ingredients.join(',');

    // Construct the Spoonacular API URL
    const spoonacularUrl = new URL('https://api.spoonacular.com/recipes/findByIngredients');
    spoonacularUrl.searchParams.append('ingredients', ingredientsString);
    spoonacularUrl.searchParams.append('number', '10'); // Get up to 10 recipes
    spoonacularUrl.searchParams.append('ranking', '1'); // Maximize used ingredients
    spoonacularUrl.searchParams.append('ignorePantry', 'true'); // Ignore pantry items
    spoonacularUrl.searchParams.append('apiKey', SPOONACULAR_API_KEY);

    // Make the request to the Spoonacular API
    const spoonacularResponse = await fetch(spoonacularUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!spoonacularResponse.ok) {
      // Handle non-2xx responses from Spoonacular
      const errorData = await spoonacularResponse.json().catch(() => ({}));
      console.error(`Spoonacular API error: ${spoonacularResponse.status} - ${JSON.stringify(errorData)}`);
      return NextResponse.json({ 
        error: 'Failed to fetch recipes from Spoonacular API.',
        details: errorData 
      }, { status: spoonacularResponse.status });
    }

    const recipes: SpoonacularRecipe[] = await spoonacularResponse.json();

    // Return the successful response from Spoonacular
    return NextResponse.json(recipes, { status: 200 });

  } catch (error) {
    console.error('Error fetching recipes:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}