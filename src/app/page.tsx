"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { Menu, Plus, Search, ArrowDownNarrowWide, ArrowUpNarrowWide, CalendarDays } from "lucide-react" // Added icons for sorting
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import FoodItem from "~/components/food-item"
import SidebarNav from "~/components/sidebar-nav"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "~/components/ui/dropdown-menu" // Assuming you have these UI components for dropdowns

// Type definition for food item from your API
interface FoodItemData {
  id: string;
  name: string;
  quantity: number;
  placement: string;
  expirationDate: string; // Assuming this can be used for "newly updated" or a separate 'updatedAt' field is needed
  imageUrl: string;
  keywords: string[];
  hidden: boolean;
  categories: {
    foodCategory: {
      name: string;
    };
  }[];
  // If your API provides an 'updatedAt' field, it would be ideal for "newly updated" sorting.
  // For demonstration, I'll use expirationDate if an explicit 'updatedAt' isn't available.
  updatedAt?: string; 
}

// Define possible sort orders
type SortOrder = 'name-asc' | 'quantity-desc' | 'quantity-asc' | 'date-new-to-old';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [foodItems, setFoodItems] = useState<FoodItemData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  // New state for sorting order
  const [sortOrder, setSortOrder] = useState<SortOrder>('name-asc') // Default sort by name A-Z
  
  const { user } = useUser()
  
  if (!user) {
    redirect('/sign-up')
  }

  // Function to fetch all food items
  const fetchFoodItems = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/fooditem') 
      
      if (!response.ok) {
        throw new Error(`Failed to fetch food items: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Filter out hidden items
      const visibleItems = data.filter((item: FoodItemData) => !item.hidden)
      setFoodItems(visibleItems)
    } catch (err) {
      console.error('Error fetching food items:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch food items')
    } finally {
      setLoading(false)
    }
  }

  // Fetch food items on component mount
  useEffect(() => {
    fetchFoodItems()
  }, [])

  // Function to sort food items based on the selected sort order
  const sortFoodItems = (items: FoodItemData[], order: SortOrder): FoodItemData[] => {
    // Create a shallow copy to avoid modifying the original state directly
    const sortedItems = [...items]; 

    switch (order) {
      case 'name-asc':
        return sortedItems.sort((a, b) => a.name.localeCompare(b.name));
      case 'quantity-desc':
        return sortedItems.sort((a, b) => b.quantity - a.quantity);
      case 'quantity-asc':
        return sortedItems.sort((a, b) => a.quantity - b.quantity);
      case 'date-new-to-old':
        // Assuming 'updatedAt' field exists or using 'expirationDate' as a fallback for 'newly updated'
        // Ideally, you'd have an 'updatedAt' timestamp from your API for this.
        return sortedItems.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.expirationDate).getTime();
          const dateB = new Date(b.updatedAt || b.expirationDate).getTime();
          return dateB - dateA; // Newest first
        });
      default:
        return sortedItems;
    }
  };

  // Filter food items based on search term AND then sort them
  const filteredAndSortedFoodItems = sortFoodItems(
    foodItems.filter(item => {
      const searchLower = searchTerm.toLowerCase()
      return (
        item.name.toLowerCase().includes(searchLower) ||
        item.keywords.some(keyword => keyword.toLowerCase().includes(searchLower)) ||
        item.placement.toLowerCase().includes(searchLower) ||
        item.categories.some(cat => cat.foodCategory.name.toLowerCase().includes(searchLower))
      )
    }),
    sortOrder
  );

  // Format date for display
  const formatDate = (dateString: string) => {
    // Check if dateString is valid to prevent "Invalid Date" errors
    if (!dateString) return "N/A"; 
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (e) {
      console.error("Error formatting date:", dateString, e);
      return "Invalid Date";
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="container mx-6 h-16 flex items-center justify-between shadow-md">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6" />
          </Button>
          <div className="h-10 w-10 rounded-full bg-[#528F04] flex items-center justify-center">
            {/* Logo will go here */}
          </div>
          <div className="w-10"></div> {/* Spacer for alignment */}
        </div>
      </header>

      <main className="container mx-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">the pantry</h1>
          <Link href="/add-food">
            <Button className="flex items-center justify-center bg-[#528F04] hover:bg-[#3e6b03] min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px]">
              <span className="h-11.5 font-bold text-4xl">+</span>
            </Button>
          </Link>
        </div>

        <div className="relative mb-6">
          {/* <Search className="absolute left-5.5 top-3 h-4 w-5 text-gray-500" strokeWidth={3} /> */}
          <Input 
            className="border-gray-300 text-gray-500 placeholder-grey-500 border rounded-full w-full" 
            placeholder="Search by name or key word"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Sorting Dropdown */}
        <div className="mb-6 flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                Sort By
                {sortOrder === 'name-asc' && <ArrowDownNarrowWide className="h-4 w-4" />}
                {sortOrder === 'quantity-desc' && <ArrowDownNarrowWide className="h-4 w-4" />}
                {sortOrder === 'quantity-asc' && <ArrowUpNarrowWide className="h-4 w-4" />}
                {sortOrder === 'date-new-to-old' && <CalendarDays className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortOrder('name-asc')}>
                Name (A-Z)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOrder('quantity-desc')}>
                Quantity (High to Low)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOrder('quantity-asc')}>
                Quantity (Low to High)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOrder('date-new-to-old')}>
                Date (New to Old)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* End Sorting Dropdown */}

        <div className="space-y-4">
          {loading && (
            <div className="text-center py-8">
              <p className="text-gray-500">Loading your food items...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-red-500">Error: {error}</p>
              <Button 
                onClick={fetchFoodItems} 
                variant="outline" 
                className="mt-2"
              >
                Try Again
              </Button>
            </div>
          )}

          {!loading && !error && filteredAndSortedFoodItems.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">
                {searchTerm ? 'No items match your search.' : 'No food items found. Add some items to get started!'}
              </p>
            </div>
          )}

          {!loading && !error && filteredAndSortedFoodItems.map((item) => (
            <Link key={item.id} href={`/product/${item.id}`}>
              <FoodItem 
                name={item.name}
                quantity={item.quantity}
                location={item.placement}
                imageUrl={item.imageUrl}
                expires={formatDate(item.expirationDate)}
              />
            </Link>
          ))}
        </div>
      </main>

      <SidebarNav 
        username={user?.fullName} 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
      />
    </div>
  )
}