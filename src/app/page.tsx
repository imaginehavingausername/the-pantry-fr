"use client"
import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { Menu, Plus, Search, ArrowDownNarrowWide, ArrowUpNarrowWide, CalendarDays } from "lucide-react" // Added icons for sorting
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import FoodItem from "~/components/food-item"
import SidebarNav from "~/components/sidebar-nav"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "~/components/ui/dropdown-menu" // Assuming you have these UI components for dropdowns
import Image from "next/image"
import PersistScrollLink from "~/components/PersistScrollLink"
import { usePathname } from "next/navigation"

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

// Simple skeleton component for better loading UX
function LoadingSkeleton() {
  return (
    <div className="space-y-3 sm:space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="flex items-center space-x-4 p-4 border rounded-lg">
            <div className="h-16 w-16 bg-gray-300 rounded"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-300 rounded w-3/4"></div>
              <div className="h-3 bg-gray-300 rounded w-1/2"></div>
              <div className="h-3 bg-gray-300 rounded w-1/4"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

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
  const pathname = usePathname(); // Get the current pathname

  // Restore scroll position after data has loaded
  useEffect(() => {
    // Check for both the loading state and the pathname
    if (!loading) {
      const storedScrollPosition = sessionStorage.getItem(`scrollPosition_${pathname}`);
      if (storedScrollPosition) {
        window.scrollTo(0, parseInt(storedScrollPosition, 10));
        // Optional: clear the value to prevent it from being restored on reload
        sessionStorage.removeItem(`scrollPosition_${pathname}`);
      }
    }
  }, [loading, pathname]); // Depend on both loading and pathname
  
  // OPTIMIZED: Faster fetch with better error handling and timeout
  const fetchFoodItems = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout
      
      const response = await fetch('/api/fooditem', {
        signal: controller.signal,
        // Add caching headers
        headers: {
          'Cache-Control': 'max-age=300', // Cache for 5 minutes
        },
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch food items: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Filter out hidden items
      const visibleItems = data.filter((item: FoodItemData) => !item.hidden)
      setFoodItems(visibleItems)
    } catch (err) {
      console.error('Error fetching food items:', err)
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('Request timed out. Please check your connection.')
        } else {
          setError(err.message)
        }
      } else {
        setError('Failed to fetch food items')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // OPTIMIZED: Fetch immediately but don't block rendering
  useEffect(() => {
    // Use setTimeout to make fetch non-blocking
    setTimeout(fetchFoodItems, 0)
  }, [fetchFoodItems])

  // OPTIMIZED: Memoized sorting function
  const sortFoodItems = useCallback((items: FoodItemData[], order: SortOrder): FoodItemData[] => {
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
          const dateA = new Date(a.expirationDate).getTime();
          const dateB = new Date(b.expirationDate).getTime();
          return dateA - dateB; // Newest first
        });
      default:
        return sortedItems;
    }
  }, []);

  // OPTIMIZED: Memoized filtering and sorting (only recalculates when dependencies change)
  const filteredAndSortedFoodItems = useMemo(() => {
    if (!foodItems.length) return []
    
    let filtered = foodItems
    
    // Only filter if there's a search term
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim()
      filtered = foodItems.filter(item => 
        item.name.toLowerCase().includes(searchLower) ||
        item.keywords.some(keyword => keyword.toLowerCase().includes(searchLower)) ||
        item.placement.toLowerCase().includes(searchLower) ||
        item.categories.some(cat => cat.foodCategory.name.toLowerCase().includes(searchLower))
      )
    }
    
    return sortFoodItems(filtered, sortOrder)
  }, [foodItems, searchTerm, sortOrder, sortFoodItems])

  // OPTIMIZED: Memoized date formatting
  const formatDate = useCallback((dateString: string) => {
    // Check if dateString is valid to prevent "Invalid Date" errors
    if (!dateString) return "N/A"; 
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (e) {
      console.error("Error formatting date:", dateString, e);
      return "Invalid Date";
    }
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between shadow-md">
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
          </Button>
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-[#528F04] flex items-center justify-center">
            <Image src="/thePantrylogo.png" alt="logo" width={40} height={40} />
          </div>
          <div className="w-8 sm:w-10"></div> {/* Spacer for alignment */}
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h1 className="text-4xl sm:text-3xl font-bold">the pantry</h1>
          <Link href="/add-food">
            <Button className="flex items-center justify-center bg-[#528F04] hover:bg-[#3e6b03] w-10 h-10 sm:w-10 sm:h-10">
              <span className="h-10 text-3xl sm:text-5xl">+</span>
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-4 sm:mb-6">
          <div className="relative flex-1">
            <Input
              className="border-gray-300 text-gray-500 placeholder-grey-500 border rounded-full w-full text-sm sm:text-base py-2 sm:py-3"
              placeholder="Search by name or key word"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* Sorting Dropdown */}
          <div className="flex justify-center sm:justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 text-sm sm:text-base px-3 sm:px-4 py-2">
                  <span className="hidden sm:inline">Sort By</span>
                  <span className="sm:hidden">Sort</span>
                  {sortOrder === 'name-asc' && <ArrowDownNarrowWide className="h-3 w-3 sm:h-4 sm:w-4" />}
                  {sortOrder === 'quantity-desc' && <ArrowDownNarrowWide className="h-3 w-3 sm:h-4 sm:w-4" />}
                  {sortOrder === 'quantity-asc' && <ArrowUpNarrowWide className="h-3 w-3 sm:h-4 sm:w-4" />}
                  {sortOrder === 'date-new-to-old' && <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setSortOrder('name-asc')} className="text-sm">
                  Name (A-Z)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOrder('quantity-desc')} className="text-sm">
                  Quantity (High to Low)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOrder('quantity-asc')} className="text-sm">
                  Quantity (Low to High)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOrder('date-new-to-old')} className="text-sm">
                  Date (Old to New)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* End Sorting Dropdown */}
        </div>

        <div className="space-y-3 sm:space-y-4">
          {loading && <LoadingSkeleton />}

          {error && (
            <div className="text-center py-8">
              <p className="text-red-500 text-sm sm:text-base mb-3">Error: {error}</p>
              <Button 
                onClick={fetchFoodItems} 
                variant="outline" 
                className="text-sm sm:text-base px-4 py-2"
              >
                Try Again
              </Button>
            </div>
          )}

          {!loading && !error && filteredAndSortedFoodItems.length === 0 && (
            <div className="text-center py-8 px-4">
              <p className="text-gray-500 text-sm sm:text-base">
                {searchTerm ? 'No items match your search.' : 'No food items found. Add some items to get started!'}
              </p>
            </div>
          )}

          {!loading && !error && filteredAndSortedFoodItems.map((item) => (
            <PersistScrollLink key={item.id} href={`/product/${item.id}`}>
              <FoodItem 
                name={item.name}
                quantity={item.quantity}
                location={item.placement}
                imageUrl={item.imageUrl}
                expires={formatDate(item.expirationDate)}
              />
            </PersistScrollLink>
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