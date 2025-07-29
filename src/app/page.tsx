"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { Menu, Plus, Search } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import FoodItem from "~/components/food-item"
import SidebarNav from "~/components/sidebar-nav"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"

// Type definition for food item from your API
interface FoodItemData {
  id: string;
  name: string;
  quantity: number;
  placement: string;
  expirationDate: string;
  imageUrl?: string;
  keywords: string[];
  hidden: boolean;
  categories: {
    foodCategory: {
      name: string;
    };
  }[];
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [foodItems, setFoodItems] = useState<FoodItemData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  
  const { user } = useUser()
  
  if (!user) {
    redirect('/sign-up')
  }

  // Function to fetch all food items
  const fetchFoodItems = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Since your GET API expects an ID parameter, we'll need to modify this
      // For now, I'll assume you have a separate endpoint to get all items
      // If not, you'll need to create one or modify your existing API
      const response = await fetch('/api/fooditem') // Assuming you have an endpoint for all items
      
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

  // Filter food items based on search term
  const filteredFoodItems = foodItems.filter(item => {
    const searchLower = searchTerm.toLowerCase()
    return (
      item.name.toLowerCase().includes(searchLower) ||
      item.keywords.some(keyword => keyword.toLowerCase().includes(searchLower)) ||
      item.placement.toLowerCase().includes(searchLower) ||
      item.categories.some(cat => cat.foodCategory.name.toLowerCase().includes(searchLower))
    )
  })

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
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
            <Button className="bg-[#528F04] hover:bg-[#3e6b03]">
              <Plus className="h-5 w-5" />
            </Button>
          </Link>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-5.5 top-3 h-4 w-5 text-gray-500" strokeWidth={3} />
          <Input 
            className="pl-10 border-gray-300 text-gray-500 placeholder-grey-500 border rounded-full w-full" 
            placeholder="Search by name or key word"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

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

          {!loading && !error && filteredFoodItems.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">
                {searchTerm ? 'No items match your search.' : 'No food items found. Add some items to get started!'}
              </p>
            </div>
          )}

          {!loading && !error && filteredFoodItems.map((item) => (
            <Link key={item.id} href={`/product/${item.id}`}>
              <FoodItem 
                name={item.name}
                quantity={item.quantity}
                location={item.placement}
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