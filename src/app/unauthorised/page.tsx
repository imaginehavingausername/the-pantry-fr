"use client"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "~/components/ui/button"
import SidebarNav from "~/components/sidebar-nav"
import { useState } from "react"
import Image from "next/image"
import { useUser } from "@clerk/nextjs"
import { redirect } from "next/navigation"

export default function UnauthorizedPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

    const { user } = useUser()
  if (user?.publicMetadata.family == true) {
    redirect("/")
  }
  
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
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col items-center justify-center text-center">
        <Image src="/thePantrylogo.png" alt="logo" width={100} height={100} className="mb-8" />
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-800 mb-4">Unauthorized</h1>
        <p className="text-base sm:text-lg text-gray-500 mb-8 max-w-lg">
          You do not have permission to access this page. Please ensure you are signed in to an account with the necessary permissions.
        </p>
      </main>

      <SidebarNav 
        username={null} // No user, so pass null
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
      />
    </div>
  )
}