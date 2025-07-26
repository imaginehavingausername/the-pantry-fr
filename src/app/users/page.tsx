"use client"

import { useState } from "react"
import { Menu } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import SidebarNav from "~/components/sidebar-nav"

export default function Users() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const users = [
    { id: 1, username: "johndoe", updatedItems: 12, createdItems: 45 },
    { id: 2, username: "janedoe", updatedItems: 8, createdItems: 23 },
    { id: 3, username: "bobsmith", updatedItems: 15, createdItems: 37 },
  ]

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
        <h1 className="text-3xl font-bold mb-6">See other users</h1>

        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.id} className="flex items-center p-4 border border-gray-200 rounded-lg">
              <Avatar className="h-12 w-12 mr-4">
                <AvatarImage src={`/placeholder.svg?height=48&width=48&query=user ${user.username}`} />
                <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-bold">{user.username}</h3>
                <p className="text-sm text-gray-600">Updated items: {user.updatedItems}</p>
                <p className="text-sm text-gray-600">Created items: {user.createdItems}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <SidebarNav username="johndoe" isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  )
}
