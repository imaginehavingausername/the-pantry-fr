"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, Plus, Search } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import FoodItem from "~/components/food-item"
import SidebarNav from "~/components/sidebar-nav"

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6" />
          </Button>
          <div className="h-10 w-10 rounded-full bg-[#528F04] flex items-center justify-center">
            {/* Logo will go here */}
          </div>
          <div className="w-10"></div> {/* Spacer for alignment */}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">the pantry</h1>
          <Link href="/add-food">
            <Button className="bg-[#528F04] hover:bg-[#3e6b03]">
              <Plus className="h-5 w-5" />
            </Button>
          </Link>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input className="pl-10 border-gray-300 border rounded-md w-full" placeholder="Search by name or key word" />
        </div>

        <div className="space-y-4">
          <Link href="/product/1">
            <FoodItem name="Organic Apples" quantity={5} location="Fruit Basket" expires="2023-08-15" />
          </Link>
          <Link href="/product/2">
            <FoodItem name="Whole Wheat Bread" quantity={1} location="Pantry Shelf" expires="2023-08-10" />
          </Link>
          <Link href="/product/3">
            <FoodItem name="Greek Yogurt" quantity={3} location="Refrigerator" expires="2023-08-05" />
          </Link>
        </div>
      </main>

      <SidebarNav username="johndoe" isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  )
}
